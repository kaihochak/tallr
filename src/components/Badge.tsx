interface BadgeProps {
  type: 'agent' | 'ide';
  name: string;
  className?: string;
}

export function Badge({ type, name, className = '' }: BadgeProps) {
  // Normalize the name to lowercase for consistent matching
  const normalizedName = name.toLowerCase();
  
  // Determine the CSS class based on type and name
  const getBadgeClass = (): string => {
    if (type === 'agent') {
      switch (normalizedName) {
        case 'claude':
          return 'agent-badge claude';
        case 'gemini':
          return 'agent-badge gemini';
        case 'cursor':
          return 'agent-badge cursor';
        default:
          return 'agent-badge default';
      }
    } else { // type === 'ide'
      switch (normalizedName) {
        case 'vscode':
        case 'code':
          return 'ide-badge vscode';
        case 'cursor':
          return 'ide-badge cursor';
        case 'windsurf':
          return 'ide-badge windsurf';
        case 'webstorm':
          return 'ide-badge webstorm';
        case 'zed':
          return 'ide-badge zed';
        default:
          return 'ide-badge default';
      }
    }
  };
  
  const badgeClass = getBadgeClass();
  const finalClassName = className ? `${badgeClass} ${className}` : badgeClass;
  
  return (
    <span className={finalClassName}>
      {name}
    </span>
  );
}