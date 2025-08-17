import { extractLatestMessage } from '@/lib/utils';

interface TaskDetailProps {
  details: string;
}

export default function TaskDetail({ details }: TaskDetailProps) {
  const latestMessage = extractLatestMessage(details);
  
  return (
    <div className="w-full mt-1">
      <div className="flex-1 text-text-secondary font-mono text-xs leading-tight whitespace-pre overflow-hidden h-16">
        {latestMessage}
      </div>
    </div>
  );
}