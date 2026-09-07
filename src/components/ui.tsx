import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? 'small' : ''}`}>
      <img src="/icon.svg" alt="" />
      <span>
        Meister's
        <br />
        <strong>
          Baton<span className="logo-dot">.</span>
        </strong>
      </span>
    </span>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'blue';
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function PageTitle({
  label,
  title,
  children,
  back,
}: {
  label?: string;
  title: string;
  children?: ReactNode;
  back?: () => void;
}) {
  return (
    <div className="page-title">
      {back && (
        <button className="icon-button back" onClick={back} aria-label="前の画面へ">
          <ArrowLeft size={21} />
        </button>
      )}
      <div>
        {label && <p>{label}</p>}
        <h1>{title}</h1>
      </div>
      {children && <div className="title-actions">{children}</div>}
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = before;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="閉じる">
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ProgressSteps({ current }: { current: number }) {
  return (
    <ol className="progress-steps">
      {['記録する', '判断を聞く', '知識にする'].map((text, i) => (
        <li key={text} className={i === current ? 'active' : i < current ? 'complete' : ''}>
          <span>{i < current ? <Check size={14} /> : i + 1}</span>
          {text}
        </li>
      ))}
    </ol>
  );
}
export function CraftIllustration({ variant = 0 }: { variant?: number }) {
  const backgrounds = ['#dae8e2', '#eee6ce', '#dce6ee'];
  const ink = ['#397467', '#8b7942', '#507a96'];
  return (
    <svg
      className="craft-illustration"
      viewBox="0 0 480 260"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="製作工程を表す模式図（サンプル）"
    >
      <defs>
        <pattern id={`grid${variant}`} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke={ink[variant % 3]} strokeOpacity=".12" />
        </pattern>
        <pattern id={`weave${variant}`} width="12" height="12" patternUnits="userSpaceOnUse">
          <path
            d="M0 0L12 12M-6 0L6 12M6 0L18 12"
            stroke={ink[variant % 3]}
            strokeOpacity=".32"
            strokeWidth="3"
          />
        </pattern>
      </defs>
      <rect width="480" height="260" fill={backgrounds[variant % 3]} />
      <rect width="480" height="260" fill={`url(#grid${variant})`} />
      <g transform="translate(240 133) rotate(-18)">
        <path
          d="M-168 26Q-126-45 43-33L164-5Q170 8 145 15L-38 40Q-130 55-168 26Z"
          fill={ink[variant % 3]}
          opacity=".17"
        />
        <path
          d="M-170 8Q-125-63 43-51L164-23Q170-10 145-3L-38 22Q-130 37-170 8Z"
          fill={backgrounds[variant % 3]}
          stroke={ink[variant % 3]}
          strokeWidth="2.2"
        />
        <path
          d="M-170 8Q-125-63 43-51L164-23Q170-10 145-3L-38 22Q-130 37-170 8Z"
          fill={`url(#weave${variant})`}
        />
        <path d="M-140 5Q-40-37 142-21" fill="none" stroke={ink[variant % 3]} strokeWidth="2" />
        <path d="M-110 42V66M119 17V66M-110 59H119" stroke={ink[variant % 3]} strokeWidth="1" />
        <circle cx="-55" cy="-9" r="8" fill="#fff" stroke={ink[variant % 3]} strokeWidth="2" />
        <path d="M-49-15L-10-77H50" fill="none" stroke={ink[variant % 3]} />
        <circle cx="55" cy="-77" r="3" fill={ink[variant % 3]} />
      </g>
      <text x="26" y="236" fontFamily="sans-serif" fontSize="11" fill={ink[variant % 3]}>
        工程イメージ · 実際の作業映像ではありません
      </text>
    </svg>
  );
}
