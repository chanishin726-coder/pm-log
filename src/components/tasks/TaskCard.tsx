'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Task } from '@/types/database';
import { getApiErrorMessage } from '@/lib/api';
import { getTaskState, type TaskState } from '@/lib/task-state';

interface TaskCardProps {
  task: Task;
  isReview?: boolean;
}

const STATE_LABELS: Record<TaskState, string> = {
  high: 'A',
  medium: 'B',
  low: 'C',
  done: 'X',
};

const BORDER_COLORS: Record<TaskState, string> = {
  high: 'border-l-red-500',
  medium: 'border-l-orange-500',
  low: 'border-l-green-500',
  done: 'border-l-slate-500',
};

export function TaskCard({ task, isReview }: TaskCardProps) {
  const queryClient = useQueryClient();
  const currentState = getTaskState(task);

  const { mutate: updateState, isPending } = useMutation({
    mutationFn: async (state: TaskState | null) => {
      const res = await fetch(`/api/tasks/${task.id}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      if (!res.ok) {
        const msg = await getApiErrorMessage(res, '상태 변경 실패');
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('상태가 변경되었습니다');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const priorityColor = isReview ? 'border-l-purple-500' : (currentState ? BORDER_COLORS[currentState] : 'border-l-muted');
  const dDay: number | null = task.due_date
    ? Math.ceil(
        (new Date(task.due_date).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const cardContent = (
    <>
      {/* 1행: 태그·프로젝트·출처/대상·D-day + 상태 버튼 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-muted-foreground">
          {task.task_id_tag}
        </span>
        {task.project && (
          <span className="text-xs text-muted-foreground">
            {task.project.name}
          </span>
        )}
        {task.source && (
          <span className="text-xs text-muted-foreground" title="출처/대상">
            {task.source}
          </span>
        )}
        {dDay != null && (
          <span
            className={`text-xs ${dDay <= 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
          >
            D{dDay <= 0 ? '' : '-'}{Math.abs(dDay)}
          </span>
        )}
        <div className="flex gap-1 shrink-0 flex-wrap ml-auto" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <Button
            size="sm"
            variant={currentState === null ? 'secondary' : 'outline'}
            onClick={() => updateState(null)}
            disabled={isPending}
            className="text-xs min-h-[44px] min-w-[44px] sm:min-h-7 sm:min-w-7"
            title="미분류"
          >
            미분류
          </Button>
          {(['high', 'medium', 'low', 'done'] as const).map((state) => (
            <Button
              key={state}
              size="sm"
              variant={currentState === state ? 'secondary' : 'outline'}
              onClick={() => updateState(state)}
              disabled={isPending}
              className="text-xs min-h-[44px] min-w-[44px] sm:min-h-7 sm:min-w-7"
              title={state === 'done' ? 'X 완료' : `${STATE_LABELS[state]} ${state === 'high' ? '우선' : state === 'medium' ? '후순위' : state === 'low' ? '대기' : '완료'}`}
            >
              {STATE_LABELS[state]}
            </Button>
          ))}
        </div>
      </div>

      {/* 2행: 본문 전체 너비(파란 영역) */}
      <div className="mt-2 w-full">
        <p
          className={`text-sm whitespace-pre-wrap break-words ${currentState === 'done' ? 'line-through text-muted-foreground' : ''}`}
        >
          {task.description}
        </p>
        {task.ai_recommended && task.ai_reason && (
          <p className="mt-1 text-xs text-muted-foreground italic">
            💡 {task.ai_reason}
          </p>
        )}
      </div>
    </>
  );

  const cardClassName = `block p-3 sm:p-4 border-l-4 ${priorityColor} bg-card rounded-lg border shadow-sm min-h-[52px] text-left`;

  if (task.log_id) {
    return (
      <Link href={`/logs/${task.log_id}`} className={cardClassName}>
        {cardContent}
      </Link>
    );
  }

  return <div className={cardClassName}>{cardContent}</div>;
}
