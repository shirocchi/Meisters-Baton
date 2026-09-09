import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  discordArchiveDate,
  readJsonLines,
  safeFilename,
  sortMessages,
  verifyArchiveFiles,
} from './discord-archive-lib.mjs';

const formatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const discordMessagePattern =
  /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/g;

function displayName(author) {
  return author?.global_name || author?.username || '名前不明';
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/([\\`*_[\]<>])/g, '\\$1');
}

function markdownLinkTarget(value) {
  return encodeURI(value).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function normalizeDiscordText(value, authors, locations) {
  return String(value ?? '')
    .replace(/<@!?(\d+)>/g, (_match, id) => `@${authors.get(id) ?? id}`)
    .replace(/<#(\d+)>/g, (_match, id) => `#${locations.get(id)?.name ?? id}`)
    .replace(/<@&(\d+)>/g, (_match, id) => `@role-${id}`)
    .replace(/<a?:([^:>]+):\d+>/g, ':$1:');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function locationFiles(locations) {
  const parents = locations.filter((location) => location.type !== 11);
  const map = new Map();
  parents.forEach((parent, parentIndex) => {
    const prefix = String(parentIndex + 1).padStart(2, '0');
    const parentBase = `${prefix}_${safeFilename(parent.name)}`;
    map.set(parent.id, `${parentBase}.md`);
    locations
      .filter((location) => location.parentId === parent.id && location.type === 11)
      .forEach((thread, threadIndex) => {
        const threadPrefix = String(threadIndex + 1).padStart(2, '0');
        map.set(thread.id, `${parentBase}/${threadPrefix}_${safeFilename(thread.name)}.md`);
      });
  });
  return map;
}

export function buildArchiveViewModel(manifest, messages) {
  const locationsById = new Map(manifest.locations.map((location) => [location.id, location]));
  const authors = new Map();
  for (const message of messages) authors.set(message.author?.id, displayName(message.author));
  const attachmentsByMessage = new Map();
  for (const attachment of manifest.attachments) {
    const current = attachmentsByMessage.get(attachment.messageId) ?? [];
    current.push({
      id: attachment.id,
      filename: attachment.filename,
      description: attachment.description,
      contentType:
        attachment.responseContentType || attachment.contentType || 'application/octet-stream',
      bytes: attachment.actualSize,
      width: attachment.width,
      height: attachment.height,
      durationSeconds: attachment.durationSeconds,
      mediaPath: attachment.mediaPath,
      sha256: attachment.sha256,
    });
    attachmentsByMessage.set(attachment.messageId, current);
  }

  const normalizedMessages = sortMessages(messages)
    .filter((message) => message.type !== 18 && locationsById.has(message.channel_id))
    .map((message) => {
      const location = locationsById.get(message.channel_id);
      const parent = location.type === 11 ? locationsById.get(location.parentId) : null;
      const content = normalizeDiscordText(message.content, authors, locationsById);
      return {
        id: message.id,
        locationId: location.id,
        locationName: location.name,
        parentName: parent?.name ?? null,
        locationPath: parent ? `${parent.name} / ${location.name}` : location.name,
        author: displayName(message.author),
        authorId: message.author?.id ?? null,
        timestamp: message.timestamp,
        editedTimestamp: message.edited_timestamp ?? null,
        date: discordArchiveDate(message.timestamp),
        time: formatter.format(new Date(message.timestamp)),
        content,
        replyTo: message.message_reference?.message_id ?? null,
        attachments: attachmentsByMessage.get(message.id) ?? [],
        embeds: (message.embeds ?? [])
          .filter((embed) => embed.url || embed.title || embed.description)
          .map((embed) => ({
            title: embed.title ?? null,
            description: embed.description ?? null,
            url: embed.url ?? null,
            provider: embed.provider?.name ?? null,
          })),
        sourceUrl: `https://discord.com/channels/${manifest.source.guildId}/${message.channel_id}/${message.id}`,
      };
    });

  const messagesByLocation = new Map();
  for (const message of normalizedMessages) {
    const current = messagesByLocation.get(message.locationId) ?? [];
    current.push(message);
    messagesByLocation.set(message.locationId, current);
  }

  const locations = manifest.locations.map((location) => ({
    ...location,
    isThread: location.type === 11,
    messageCount: messagesByLocation.get(location.id)?.length ?? 0,
    children: manifest.locations
      .filter((child) => child.type === 11 && child.parentId === location.id)
      .map((child) => child.id),
  }));

  return {
    format: 'meisters-baton-discord-share',
    version: 1,
    generatedAt: new Date().toISOString(),
    source: manifest.source,
    scope: manifest.scope,
    stats: {
      messages: normalizedMessages.length,
      attachments: manifest.attachments.length,
      attachmentBytes: manifest.stats.attachmentBytes,
      locations: locations.length,
    },
    locations,
    messages: normalizedMessages,
  };
}

function rewriteDiscordLinksForMarkdown(content, model, currentFile, files) {
  const messages = new Map(model.messages.map((message) => [message.id, message]));
  return content.replace(discordMessagePattern, (url, guildId, _channelId, messageId) => {
    const target = messages.get(messageId);
    if (guildId !== model.source.guildId || !target) return url;
    const targetFile = files.get(target.locationId);
    const relative =
      path.posix.relative(path.posix.dirname(currentFile), targetFile) ||
      path.posix.basename(targetFile);
    return `[Discord内リンク](${markdownLinkTarget(`${relative}#m-${messageId}`)})`;
  });
}

export function markdownForLocation(model, locationId, files = locationFiles(model.locations)) {
  const location = model.locations.find((item) => item.id === locationId);
  if (!location) throw new Error(`保存先が見つかりません: ${locationId}`);
  const currentFile = files.get(location.id);
  const parent = location.isThread
    ? model.locations.find((item) => item.id === location.parentId)
    : null;
  const messagesById = new Map(model.messages.map((message) => [message.id, message]));
  const messages = model.messages.filter((message) => message.locationId === location.id);
  const lines = [
    '---',
    `title: ${JSON.stringify(location.name)}`,
    `source: ${JSON.stringify(`Meister Discord / ${location.parentId ? `${parent?.name} / ` : ''}${location.name}`)}`,
    `discord_location_id: ${JSON.stringify(location.id)}`,
    `message_count: ${messages.length}`,
    `import_status: ${JSON.stringify('一次資料・未整理')}`,
    '---',
    '',
    `# ${location.name}`,
    '',
    '> Meister「プロペラ班」Discordから取得した一次資料です。記述は自動整理前で、現行手順として未確認です。',
    '',
  ];
  if (parent) lines.push(`親チャンネル: ${parent.name}`, '');
  if (location.children.length) {
    lines.push('## スレッド', '');
    for (const childId of location.children) {
      const child = model.locations.find((item) => item.id === childId);
      const childFile = files.get(childId);
      const relative = path.posix.relative(path.posix.dirname(currentFile), childFile);
      lines.push(
        `- [${escapeMarkdown(child.name)}](${markdownLinkTarget(relative)})（${child.messageCount}件）`,
      );
    }
    lines.push('');
  }

  let previousDate = null;
  for (const message of messages) {
    if (message.date !== previousDate) {
      lines.push(`## ${message.date}`, '');
      previousDate = message.date;
    }
    lines.push(`<a id="m-${message.id}"></a>`);
    lines.push(`### ${message.time} — ${escapeMarkdown(message.author)}`, '');
    if (message.replyTo) {
      const reply = messagesById.get(message.replyTo);
      if (reply) {
        const replyFile = files.get(reply.locationId);
        const relative =
          path.posix.relative(path.posix.dirname(currentFile), replyFile) ||
          path.posix.basename(replyFile);
        lines.push(
          `> 返信先: [${escapeMarkdown(reply.author)} — ${escapeMarkdown(reply.content.slice(0, 80) || '添付メッセージ')}](${markdownLinkTarget(`${relative}#m-${reply.id}`)})`,
          '',
        );
      } else {
        lines.push(
          `> 返信先メッセージ: ${message.replyTo}（アーカイブ範囲外または取得対象外）`,
          '',
        );
      }
    }
    const body = rewriteDiscordLinksForMarkdown(message.content, model, currentFile, files);
    lines.push(body || '（本文なし）', '');
    for (const attachment of message.attachments) {
      const target = path.posix.relative(
        path.posix.dirname(currentFile),
        `../01_一次アーカイブ/${attachment.mediaPath}`,
      );
      const link = markdownLinkTarget(target);
      if (attachment.contentType.startsWith('image/')) {
        lines.push(
          `![${escapeMarkdown(attachment.description || attachment.filename)}](${link})`,
          '',
        );
      } else if (attachment.contentType.startsWith('video/')) {
        lines.push(`[動画: ${escapeMarkdown(attachment.filename)}](${link})`, '');
      } else if (attachment.contentType.startsWith('audio/')) {
        lines.push(`[音声: ${escapeMarkdown(attachment.filename)}](${link})`, '');
      } else {
        lines.push(`[添付: ${escapeMarkdown(attachment.filename)}](${link})`, '');
      }
    }
    for (const embed of message.embeds) {
      if (embed.url)
        lines.push(
          `[${escapeMarkdown(embed.title || embed.provider || embed.url)}](${embed.url})`,
          '',
        );
    }
    lines.push(`[Discord原文](${message.sourceUrl})`, '', '---', '');
  }
  return `${lines.join('\n').trim()}\n`;
}

export function renderViewerHtml(model) {
  const data = escapeJsonForHtml(model);
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>26代プロペラ班 Discord アーカイブ</title>
  <style>
    :root{color-scheme:light;--ink:#202923;--muted:#667269;--line:#dce4dd;--paper:#fff;--wash:#f5f7f4;--green:#1f654d;--green-soft:#e6f1eb;--amber:#8a641c;--shadow:0 10px 30px rgba(35,55,43,.08)}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--wash);color:var(--ink);font-family:"Noto Sans JP","Yu Gothic UI",system-ui,sans-serif;line-height:1.75}
    button,input{font:inherit}button{color:inherit}.shell{display:grid;grid-template-columns:310px minmax(0,1fr);min-height:100vh}.sidebar{position:sticky;top:0;height:100vh;overflow:auto;background:#18261f;color:#edf4ef;padding:24px 18px}.brand{display:flex;align-items:center;gap:12px;margin:0 4px 20px}.brand-mark{display:grid;place-items:center;width:39px;height:39px;border:1px solid #648172;border-radius:9px;font-weight:800}.brand h1{font-size:15px;margin:0}.brand p{font-size:11px;color:#b8c9bf;margin:2px 0 0}.search{display:flex;align-items:center;background:#fff;border-radius:8px;padding:2px 10px;margin-bottom:18px}.search input{width:100%;border:0;outline:0;padding:9px 4px;color:#18261f;min-height:42px}.tree-section{margin:18px 0}.tree-label{margin:0 8px 8px;color:#9fb3a7;font-size:10px;letter-spacing:.12em;font-weight:700}.tree button{width:100%;border:0;background:transparent;color:#dce8e0;text-align:left;border-radius:7px;padding:9px 10px;cursor:pointer;display:flex;gap:8px;align-items:center;min-height:42px}.tree button:hover,.tree button.active{background:#2c4437;color:#fff}.tree button.child{padding-left:29px;font-size:12px}.tree button span:last-child{margin-left:auto;color:#91a99b;font-size:10px}.main{min-width:0}.topbar{position:sticky;top:0;z-index:3;background:rgba(245,247,244,.93);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);padding:16px clamp(20px,4vw,58px);display:flex;align-items:center;gap:12px}.topbar strong{font-size:13px}.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;background:#fff3d8;color:var(--amber);border:1px solid #ead5a4;font-size:10px;font-weight:700}.menu{display:none;margin-left:auto;border:1px solid var(--line);background:white;border-radius:7px;min-width:44px;min-height:44px}.content{max-width:1040px;margin:0 auto;padding:42px clamp(20px,5vw,68px) 80px}.hero{background:linear-gradient(135deg,#fff,#edf4ef);border:1px solid var(--line);border-radius:14px;padding:28px 30px;box-shadow:var(--shadow);margin-bottom:24px}.eyebrow{font-size:11px;color:var(--green);font-weight:800;letter-spacing:.08em;margin:0 0 5px}.hero h2{font-family:Georgia,"Yu Mincho",serif;font-size:clamp(25px,4vw,40px);line-height:1.35;margin:0}.hero p{color:var(--muted);font-size:13px;margin:10px 0 0}.stats{display:flex;gap:17px;flex-wrap:wrap;margin-top:18px}.stats span{font-size:11px;color:var(--muted)}.stats b{color:var(--ink);font-size:16px;margin-right:4px}.date-heading{display:flex;align-items:center;gap:14px;margin:34px 0 14px;font-family:Georgia,"Yu Mincho",serif;font-size:22px}.date-heading::after{content:"";height:1px;background:var(--line);flex:1}.message{scroll-margin-top:88px;background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:18px 20px;margin:0 0 11px;box-shadow:0 3px 14px rgba(35,55,43,.035)}.message:target,.message.focused{outline:3px solid #b7d7c5}.meta{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px}.avatar{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:var(--green-soft);color:var(--green);font-weight:800;font-size:12px}.meta strong{font-size:12px}.meta time,.location-tag{font-size:10px;color:var(--muted)}.location-tag{background:#f0f4f1;border-radius:999px;padding:2px 7px}.body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}.body a,.embed a,.file-link{color:var(--green);text-underline-offset:3px}.reply{border-left:3px solid #8fb39e;background:#f5f8f5;padding:9px 12px;margin:8px 0 12px;border-radius:0 7px 7px 0;font-size:11px;color:var(--muted);cursor:pointer}.attachments{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:14px}.attachment{margin:0;min-width:0}.attachment img,.attachment video{display:block;max-width:100%;max-height:520px;border-radius:8px;border:1px solid var(--line);background:#101511}.attachment audio{width:100%}.attachment figcaption{font-size:10px;color:var(--muted);margin-top:5px;overflow-wrap:anywhere}.embed{margin-top:12px;padding:10px 12px;border-left:3px solid #9db5a6;background:#f6f8f6;font-size:11px}.source{display:inline-block;margin-top:12px;font-size:10px;color:var(--muted)}.empty{padding:60px 20px;text-align:center;color:var(--muted)}.result-summary{font-size:12px;color:var(--muted);margin:0 0 14px}.privacy{font-size:10px;color:#abc0b4;border-top:1px solid #385044;padding:16px 9px;margin-top:24px}
    @media(max-width:760px){.shell{display:block}.sidebar{position:fixed;z-index:10;inset:0 15% 0 0;transform:translateX(-105%);transition:transform .18s;box-shadow:20px 0 50px #0005}.sidebar.open{transform:none}.menu{display:block}.content{padding-top:25px}.hero{padding:23px 20px}.message{padding:16px}.attachments{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.sidebar{transition:none}}
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="brand-mark">P</div><div><h1>プロペラ班 Archive</h1><p>Meister 26代 Discord</p></div></div>
      <label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="本文・添付・投稿者を検索" aria-label="アーカイブを検索"></label>
      <nav class="tree" id="tree" aria-label="チャンネルとスレッド"></nav>
      <p class="privacy">個人名・写真・設計資料を含みます。Meisterと開発チームで承認した範囲だけに共有してください。</p>
    </aside>
    <main class="main">
      <header class="topbar"><strong>26代プロペラ班 Discord アーカイブ</strong><span class="chip">一次資料・未整理</span><button class="menu" id="menu" aria-label="チャンネル一覧を開く">☰</button></header>
      <div class="content">
        <section class="hero"><p class="eyebrow" id="path">PROPELLER / DISCORD</p><h2 id="title">読み込み中</h2><p id="description">Discordの原文・画像・動画・添付を、チャンネル構造と日付順で閲覧できます。</p><div class="stats" id="stats"></div></section>
        <p class="result-summary" id="result-summary"></p>
        <div id="messages"></div>
      </div>
    </main>
  </div>
  <script id="archive-data" type="application/json">${data}</script>
  <script>
    const archive=JSON.parse(document.getElementById('archive-data').textContent);
    const locations=new Map(archive.locations.map(item=>[item.id,item]));
    const messages=new Map(archive.messages.map(item=>[item.id,item]));
    const parents=archive.locations.filter(item=>!item.isThread);
    const tree=document.getElementById('tree');
    const output=document.getElementById('messages');
    const search=document.getElementById('search');
    let selected=(archive.locations.find(item=>item.name==='ペラ日記')||parents[0]).id;
    function mediaUrl(value){return '../01_一次アーカイブ/'+value.split('/').map(encodeURIComponent).join('/')}
    function safeUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}}
    function initials(name){return Array.from(name||'?').slice(0,2).join('')}
    function appendLinkedText(element,text){
      const pattern=/https?:\/\/[^\s<>]+/g;let last=0;
      for(const match of text.matchAll(pattern)){
        element.append(document.createTextNode(text.slice(last,match.index)));
        const raw=match[0];const clean=raw.replace(/[),.;!?。、）］】]+$/,'');const suffix=raw.slice(clean.length);
        const internal=clean.match(/discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
        const link=document.createElement('a');link.textContent=clean;
        if(internal&&internal[1]===archive.source.guildId&&messages.has(internal[3])){link.href='#m-'+internal[3];link.addEventListener('click',event=>{event.preventDefault();focusMessage(internal[3])})}
        else{const url=safeUrl(clean);if(url){link.href=url;link.target='_blank';link.rel='noreferrer'}else link.textContent=raw}
        element.append(link);if(suffix)element.append(document.createTextNode(suffix));last=match.index+raw.length;
      }
      element.append(document.createTextNode(text.slice(last)));
    }
    function buttonFor(location,child=false){const button=document.createElement('button');button.className=child?'child':'';button.dataset.id=location.id;button.innerHTML='<span>'+(child?'↳':'#')+'</span><span></span><span>'+location.messageCount+'</span>';button.children[1].textContent=location.name;button.addEventListener('click',()=>selectLocation(location.id));return button}
    function renderTree(){tree.replaceChildren();for(const parent of parents){const section=document.createElement('section');section.className='tree-section';section.append(buttonFor(parent));for(const id of parent.children)section.append(buttonFor(locations.get(id),true));tree.append(section)}updateActive()}
    function updateActive(){for(const button of tree.querySelectorAll('button'))button.classList.toggle('active',button.dataset.id===selected)}
    function selectLocation(id){selected=id;search.value='';render();document.getElementById('sidebar').classList.remove('open');history.replaceState(null,'','#channel='+id)}
    function focusMessage(id){const message=messages.get(id);if(!message)return;selected=message.locationId;search.value='';render();requestAnimationFrame(()=>{const element=document.getElementById('m-'+id);element?.classList.add('focused');element?.scrollIntoView({block:'center'})});history.replaceState(null,'','#message='+id)}
    function attachmentNode(attachment){const figure=document.createElement('figure');figure.className='attachment';const url=mediaUrl(attachment.mediaPath);let media;if(attachment.contentType.startsWith('image/')){media=document.createElement('img');media.loading='lazy';media.alt=attachment.description||attachment.filename;media.src=url}else if(attachment.contentType.startsWith('video/')){media=document.createElement('video');media.controls=true;media.preload='metadata';media.src=url}else if(attachment.contentType.startsWith('audio/')){media=document.createElement('audio');media.controls=true;media.preload='metadata';media.src=url}else{media=document.createElement('a');media.className='file-link';media.href=url;media.textContent='添付を開く: '+attachment.filename}figure.append(media);const caption=document.createElement('figcaption');caption.textContent=attachment.filename+' · '+new Intl.NumberFormat('ja-JP').format(attachment.bytes)+' bytes';figure.append(caption);return figure}
    function messageNode(message,showLocation){const article=document.createElement('article');article.className='message';article.id='m-'+message.id;const meta=document.createElement('div');meta.className='meta';const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=initials(message.author);const author=document.createElement('strong');author.textContent=message.author;const time=document.createElement('time');time.dateTime=message.timestamp;time.textContent=message.time+(message.editedTimestamp?' · 編集済み':'');meta.append(avatar,author,time);if(showLocation){const tag=document.createElement('span');tag.className='location-tag';tag.textContent=message.locationPath;meta.append(tag)}article.append(meta);if(message.replyTo){const reply=messages.get(message.replyTo);const box=document.createElement('button');box.className='reply';box.type='button';box.textContent=reply?'↩ '+reply.author+'：'+(reply.content||'添付メッセージ').slice(0,100):'↩ 返信先はアーカイブ範囲外';if(reply)box.addEventListener('click',()=>focusMessage(reply.id));article.append(box)}const body=document.createElement('div');body.className='body';appendLinkedText(body,message.content||'（本文なし）');article.append(body);if(message.attachments.length){const attachments=document.createElement('div');attachments.className='attachments';for(const item of message.attachments)attachments.append(attachmentNode(item));article.append(attachments)}for(const embed of message.embeds){const card=document.createElement('div');card.className='embed';const url=safeUrl(embed.url);if(url){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noreferrer';link.textContent=embed.title||embed.provider||url;card.append(link)}else card.textContent=embed.title||embed.description||'埋め込み';if(embed.description){const p=document.createElement('p');p.textContent=embed.description.slice(0,300);card.append(p)}article.append(card)}const source=document.createElement('a');source.className='source';source.href=message.sourceUrl;source.target='_blank';source.rel='noreferrer';source.textContent='Discord原文を開く';article.append(source);return article}
    function normalized(value){return value.normalize('NFKC').toLocaleLowerCase('ja-JP')}
    function render(){const query=normalized(search.value.trim());const location=locations.get(selected);let list;if(query){list=archive.messages.filter(message=>normalized([message.content,message.author,message.locationPath,...message.attachments.map(item=>item.filename)].join(' ')).includes(query))}else list=archive.messages.filter(message=>message.locationId===selected);document.getElementById('title').textContent=query?'検索結果':location.name;document.getElementById('path').textContent=query?'ARCHIVE / SEARCH':location.parentName?'PROPELLER / '+location.parentName:'PROPELLER / CHANNEL';document.getElementById('description').textContent=query?'「'+search.value.trim()+'」を本文・添付名・投稿者から検索しています。':'Discordの原文・画像・動画・添付を日付順で表示しています。';document.getElementById('stats').innerHTML='<span><b>'+new Intl.NumberFormat('ja-JP').format(list.length)+'</b>メッセージ</span><span><b>'+new Intl.NumberFormat('ja-JP').format(list.reduce((n,m)=>n+m.attachments.length,0))+'</b>添付</span>';document.getElementById('result-summary').textContent=query?list.length+'件見つかりました'+(list.length>500?'（先頭500件を表示）':''):'';output.replaceChildren();let date=null;for(const message of list.slice(0,500)){if(message.date!==date){date=message.date;const heading=document.createElement('h3');heading.className='date-heading';heading.textContent=date;output.append(heading)}output.append(messageNode(message,Boolean(query)))}if(!list.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='該当するメッセージはありません。';output.append(empty)}updateActive()}
    search.addEventListener('input',render);document.getElementById('menu').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));renderTree();const hash=new URLSearchParams(location.hash.slice(1));if(hash.get('message')&&messages.has(hash.get('message')))focusMessage(hash.get('message'));else if(hash.get('channel')&&locations.has(hash.get('channel')))selected=hash.get('channel');render();
  </script>
</body>
</html>`;
}

export async function buildSharePackage(archiveRoot, outputRoot) {
  const manifestText = await readFile(path.join(archiveRoot, 'manifest.json'), 'utf8');
  const messagesText = await readFile(path.join(archiveRoot, 'messages.jsonl'), 'utf8');
  const manifest = JSON.parse(manifestText);
  const messages = await readJsonLines(path.join(archiveRoot, 'messages.jsonl'));
  const verified = await verifyArchiveFiles(archiveRoot, manifest, messages);
  if (!verified.ok)
    throw new Error(`一次アーカイブの検証に失敗しました。\n${verified.errors.join('\n')}`);
  const model = buildArchiveViewModel(manifest, messages);
  const files = locationFiles(model.locations);
  const viewerRoot = path.join(outputRoot, '02_閲覧用');
  const wikiRoot = path.join(outputRoot, '03_Wiki取込用');
  await mkdir(viewerRoot, { recursive: true });
  await mkdir(wikiRoot, { recursive: true });
  await writeFile(path.join(viewerRoot, 'index.html'), renderViewerHtml(model), 'utf8');

  const indexLines = [
    '# Discord一次資料 Markdown索引',
    '',
    '> 各ページはMeister「プロペラ班」Discordの原文をチャンネル・スレッド単位で並べたものです。現行の製作手順としては未確認です。',
    '',
  ];
  for (const parent of model.locations.filter((location) => !location.isThread)) {
    indexLines.push(
      `## ${parent.name}`,
      '',
      `- [${parent.name}](${markdownLinkTarget(files.get(parent.id))})（${parent.messageCount}件）`,
    );
    for (const childId of parent.children) {
      const child = model.locations.find((location) => location.id === childId);
      indexLines.push(
        `  - [${child.name}](${markdownLinkTarget(files.get(child.id))})（${child.messageCount}件）`,
      );
    }
    indexLines.push('');
  }
  await writeFile(path.join(wikiRoot, 'INDEX.md'), `${indexLines.join('\n').trim()}\n`, 'utf8');
  for (const location of model.locations) {
    const relative = files.get(location.id);
    const destination = path.join(wikiRoot, ...relative.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, markdownForLocation(model, location.id, files), 'utf8');
  }
  await writeFile(
    path.join(wikiRoot, 'knowledge-source.json'),
    `${JSON.stringify(model, null, 2)}\n`,
    'utf8',
  );

  const shareManifest = {
    format: model.format,
    version: model.version,
    generatedAt: model.generatedAt,
    sourceArchive: {
      manifestSha256: sha256(manifestText),
      messagesSha256: sha256(messagesText),
      verified: true,
    },
    stats: model.stats,
    outputs: {
      viewer: '02_閲覧用/index.html',
      markdownIndex: '03_Wiki取込用/INDEX.md',
      normalizedJson: '03_Wiki取込用/knowledge-source.json',
      markdownPages: model.locations.length,
    },
  };
  await writeFile(
    path.join(outputRoot, 'share-manifest.json'),
    `${JSON.stringify(shareManifest, null, 2)}\n`,
    'utf8',
  );
  const readme = `# 26代プロペラ班 Discord共有データ

Meisterサーバーの「プロペラ班」カテゴリを、読み取り専用Botで取得した共有用アーカイブです。

## 開き方

1. **人が読む**: \`02_閲覧用/index.html\` をブラウザで開く（検索、チャンネル/スレッド、画像・動画表示）。
2. **Markdownで読む/取り込む**: \`03_Wiki取込用/INDEX.md\` を開く。
3. **プログラムから取り込む**: \`03_Wiki取込用/knowledge-source.json\` を使う。
4. **Meister's Batonへ取り込む**: アプリの「技術Wiki」→「Wiki下書きを取り込む」で \`04_アプリ投入用/プロペラWiki下書き.json\` を選ぶ。
5. **原本を検証する**: \`01_一次アーカイブ/manifest.json\` と \`messages.jsonl\`、\`media/\` を一組で扱う。

## 取得範囲

- メッセージ: ${manifest.stats.messageCount}件
- 添付: ${manifest.stats.attachmentCount}件（${manifest.stats.attachmentBytes} bytes）
- チャンネル/スレッド: ${manifest.locations.length}か所
- 以前の合意に従い、雑談チャンネル「ぺらんだむ」は取得対象外

## 注意

- 個人名、会話、写真、動画、設計資料を含みます。Meisterと開発チームで承認した範囲だけに共有してください。
- Wiki用Markdownは一次資料を読みやすく並べただけで、製作条件の正しさや現行性を保証しません。
- アプリ用Wikiはペラ日記を主資料にした仮整理です。すべて下書きであり、原文と照合してから人が確認・公開してください。
- Botトークン、移植先Webhook、Discord移植状態ファイルは含めていません。
- 添付本体は \`01_一次アーカイブ/media/\` に一度だけ保存し、閲覧版とMarkdownから相対参照しています。フォルダ構造を崩さず共有してください。
`;
  await writeFile(path.join(outputRoot, '00_はじめに.md'), readme, 'utf8');
  return shareManifest;
}

async function markdownFiles(root) {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.name.endsWith('.md') && entry.name !== 'INDEX.md') found.push(target);
    }
  }
  await walk(root);
  return found;
}

export async function verifySharePackage(archiveRoot, outputRoot) {
  const errors = [];
  let shareManifest;
  let model;
  try {
    shareManifest = JSON.parse(
      await readFile(path.join(outputRoot, 'share-manifest.json'), 'utf8'),
    );
    model = JSON.parse(
      await readFile(path.join(outputRoot, '03_Wiki取込用', 'knowledge-source.json'), 'utf8'),
    );
  } catch (error) {
    return { ok: false, errors: [`共有版の索引を読めません: ${error.message}`] };
  }
  const pages = await markdownFiles(path.join(outputRoot, '03_Wiki取込用'));
  if (pages.length !== shareManifest.outputs.markdownPages)
    errors.push(
      `Markdownページ数不一致: expected=${shareManifest.outputs.markdownPages} actual=${pages.length}`,
    );
  if (model.messages.length !== shareManifest.stats.messages)
    errors.push(
      `閲覧メッセージ数不一致: expected=${shareManifest.stats.messages} actual=${model.messages.length}`,
    );
  const attachments = model.messages.flatMap((message) => message.attachments);
  if (attachments.length !== shareManifest.stats.attachments)
    errors.push(
      `添付参照数不一致: expected=${shareManifest.stats.attachments} actual=${attachments.length}`,
    );
  for (const attachment of attachments) {
    const target = path.join(archiveRoot, ...attachment.mediaPath.split('/'));
    try {
      await access(target);
      const details = await stat(target);
      if (details.size !== attachment.bytes)
        errors.push(
          `添付容量不一致: ${attachment.mediaPath} expected=${attachment.bytes} actual=${details.size}`,
        );
    } catch {
      errors.push(`添付が見つかりません: ${attachment.mediaPath}`);
    }
  }
  const html = await readFile(path.join(outputRoot, '02_閲覧用', 'index.html'), 'utf8');
  if (!html.includes('id="archive-data"') || !html.includes('プロペラ班 Archive'))
    errors.push('閲覧用HTMLに必要なデータまたは画面要素がありません。');
  return {
    ok: errors.length === 0,
    errors,
    messageCount: model.messages.length,
    attachmentCount: attachments.length,
    markdownPageCount: pages.length,
  };
}
