function Icon({ children, className = "", viewBox = "0 0 24 24", strokeWidth = 1.8 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function AppLogoIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 7v10l7 4 7-4V7z" />
      <circle cx="12" cy="12" r="3.25" />
    </Icon>
  );
}

export function ChatIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 14.5a4 4 0 0 1-4 4H9l-5 3v-4.5a4 4 0 0 1-4-4V7.5a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4z" />
    </Icon>
  );
}

export function DocumentsIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </Icon>
  );
}

export function FolderIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 7.5h6l2 2h9v8.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z" />
      <path d="M3.5 7.5V6a2 2 0 0 1 2-2h4l2 2" />
    </Icon>
  );
}

export function UploadIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 16V6" />
      <path d="M8.5 9.5 12 6l3.5 3.5" />
      <path d="M5 17.5a3.5 3.5 0 0 1 3.5-3.5h7a3.5 3.5 0 0 1 3.5 3.5" />
    </Icon>
  );
}

export function SpinnerIcon(props) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" className={`shrink-0 animate-spin ${props.className || ""}`}>
      <path d="M21 12a9 9 0 1 1-3.3-6.9" />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function ErrorIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 8v5" />
      <path d="M12 16.75h.01" />
      <path d="M10.2 4.8h3.6l7.4 12.4a2 2 0 0 1-1.7 3h-15a2 2 0 0 1-1.7-3z" />
    </Icon>
  );
}

export function SettingsIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2.2 2.2 0 1 1-3.12 3.12l-.05-.05A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1.08 1.66V21a2.2 2.2 0 1 1-4.4 0v-.04A1.8 1.8 0 0 0 8.44 19.4a1.8 1.8 0 0 0-1.98.36l-.05.05a2.2 2.2 0 1 1-3.12-3.12l.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.66-1.08H3a2.2 2.2 0 1 1 0-4.4h.04A1.8 1.8 0 0 0 4.6 8.44a1.8 1.8 0 0 0-.36-1.98l-.05-.05A2.2 2.2 0 1 1 7.31 3.29l.05.05A1.8 1.8 0 0 0 9 4.6 1.8 1.8 0 0 0 10.08 2.94V3a2.2 2.2 0 1 1 4.4 0v.04A1.8 1.8 0 0 0 15.56 4.6a1.8 1.8 0 0 0 1.98-.36l.05-.05a2.2 2.2 0 1 1 3.12 3.12l-.05.05A1.8 1.8 0 0 0 19.4 9c.66.1 1.18.63 1.28 1.29V13.7A1.8 1.8 0 0 0 19.4 15Z" />
    </Icon>
  );
}

export function PlugIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 3v6" />
      <path d="M15 3v6" />
      <path d="M7 9h10v2a5 5 0 0 1-5 5v5" />
      <path d="M12 16v5" />
    </Icon>
  );
}

export function TrashIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7v12h10V7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </Icon>
  );
}

export function LightningIcon(props) {
  return (
    <Icon {...props}>
      <path d="M13 2 5 13h5l-1 9 8-11h-5z" />
    </Icon>
  );
}

export function BatchIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 7h14" />
      <path d="M5 12h10" />
      <path d="M5 17h14" />
    </Icon>
  );
}

export function LockIcon(props) {
  return (
    <Icon {...props}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
    </Icon>
  );
}

export function StarIcon(props) {
  return (
    <Icon {...props}>
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.9 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
    </Icon>
  );
}

export function OnlineIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function OfflineIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 8.5 7 7" />
    </Icon>
  );
}

export function FileIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
    </Icon>
  );
}

export function SearchIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

export function CalculatorIcon(props) {
  return (
    <Icon {...props}>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h2M12 12h2M8 16h2M12 16h2" />
    </Icon>
  );
}

export function SummaryIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 4h10l3 3v13H7z" />
      <path d="M14 4v4h4" />
      <path d="M9 11h6" />
      <path d="M9 15h6" />
    </Icon>
  );
}

export function GlobeIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16" />
      <path d="M12 4a12 12 0 0 1 0 16" />
      <path d="M12 4a12 12 0 0 0 0 16" />
    </Icon>
  );
}

export function CodeIcon(props) {
  return (
    <Icon {...props}>
      <path d="m9 7-4 5 4 5" />
      <path d="m15 7 4 5-4 5" />
      <path d="M13 6 11 18" />
    </Icon>
  );
}

export function HashIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 4 6 20" />
      <path d="M18 4 16 20" />
      <path d="M4 9h16" />
      <path d="M3 15h16" />
    </Icon>
  );
}

export function BracesIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10 5H8a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2" />
      <path d="M14 5h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2" />
    </Icon>
  );
}

export function PencilIcon(props) {
  return (
    <Icon {...props}>
      <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </Icon>
  );
}

export function PlusCircleIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </Icon>
  );
}

export function ChevronDownIcon(props) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

export function TemplateIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </Icon>
  );
}

export function CopyIcon(props) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  );
}

export function ChartIcon(props) {
  return (
    <Icon {...props}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </Icon>
  );
}

export function PinIcon({ filled, ...props }) {
  return (
    <Icon {...props}>
      <path 
        d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.36a.5.5 0 0 0 .62.62l4.36-1.32a2 2 0 0 0 .83-.5z" 
        fill={filled ? "currentColor" : "none"} 
      />
      <path d="m15 9 3-3" />
    </Icon>
  );
}
