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
    const baseClass = 'badge';
    
    if (type === 'agent') {
      switch (normalizedName) {
        case 'claude':
          return `${baseClass} badge-agent-claude`;
        case 'gemini':
          return `${baseClass} badge-agent-gemini`;
        case 'cursor':
          return `${baseClass} badge-agent-cursor`;
        default:
          return `${baseClass} badge-agent-default`;
      }
    } else { // type === 'ide'
      switch (normalizedName) {
        case 'vscode':
        case 'code':
          return `${baseClass} badge-ide-vscode`;
        case 'cursor':
          return `${baseClass} badge-ide-cursor`;
        case 'windsurf':
          return `${baseClass} badge-ide-windsurf`;
        case 'webstorm':
          return `${baseClass} badge-ide-webstorm`;
        case 'zed':
          return `${baseClass} badge-ide-zed`;
        default:
          return `${baseClass} badge-ide-default`;
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