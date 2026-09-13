import { Component, createRef, type ReactNode } from 'react';

/** Capture the outgoing picture before React changes it. The overlay is inert:
 * only the new scene has controls, a WebGL context, or an accessibility tree. */
export class SceneTransition extends Component<{ scene: string; children: ReactNode }> {
  private content = createRef<HTMLDivElement>();
  private overlay = createRef<HTMLDivElement>();
  private animation: Animation | null = null;
  getSnapshotBeforeUpdate(previous: Readonly<{ scene: string; children: ReactNode }>) {
    if (
      previous.scene === this.props.scene ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return null;
    const source = this.content.current;
    if (!source) return null;
    const snapshot = source.cloneNode(true) as HTMLDivElement;
    snapshot.querySelectorAll('*').forEach((element) => {
      for (const attr of Array.from(element.attributes))
        if (attr.name.startsWith('data-')) element.removeAttribute(attr.name);
    });
    const canvases = snapshot.querySelectorAll('canvas');
    source.querySelectorAll('canvas').forEach((canvas, i) => {
      try {
        const image = document.createElement('img');
        canvas.dispatchEvent(new Event('book-snapshot'));
        image.src = canvas.toDataURL();
        image.style.cssText = `width:${canvas.clientWidth}px;height:${canvas.clientHeight}px;display:block`;
        image.alt = '';
        canvases[i]?.replaceWith(image);
      } catch {
        canvases[i]?.remove();
      }
    });
    // SVG ids are needed locally for masks; prefix them so the old and new
    // diagrams cannot accidentally resolve one another's paint servers.
    snapshot.querySelectorAll('[id]').forEach((node) => {
      const id = node.id,
        replacement = `outgoing-${id}`;
      snapshot.querySelectorAll('*').forEach((element) => {
        for (const attr of Array.from(element.attributes)) {
          if (attr.value.includes(`url(#${id})`))
            element.setAttribute(
              attr.name,
              attr.value.replaceAll(`url(#${id})`, `url(#${replacement})`),
            );
        }
      });
      node.id = replacement;
    });
    return snapshot;
  }
  componentDidUpdate(_previous: unknown, _state: unknown, snapshot: HTMLDivElement | null) {
    if (!snapshot || !this.overlay.current) return;
    this.animation?.cancel();
    const overlay = this.overlay.current;
    overlay.replaceChildren(snapshot);
    this.animation = overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 420,
      easing: 'ease-in-out',
    });
    this.animation.onfinish = () => overlay.replaceChildren();
  }
  componentWillUnmount() {
    this.animation?.cancel();
  }
  render() {
    return (
      <div className="book-scene-transition" data-scene={this.props.scene}>
        <div ref={this.content}>{this.props.children}</div>
        <div ref={this.overlay} className="book-scene-outgoing" aria-hidden="true" inert />
      </div>
    );
  }
}
