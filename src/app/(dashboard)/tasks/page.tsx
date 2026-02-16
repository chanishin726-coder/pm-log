'use client';

import { TaskBoard } from '@/components/tasks/TaskBoard';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';

export default function TasksPage() {
  const queryClient = useQueryClient();

  const { mutate: runTaskPlan, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/task-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '실패');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('할일 파악 완료');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-semibold">할일 관리</h1>
        <Button
          onClick={() => runTaskPlan()}
          disabled={isPending}
          variant="outline"
          size="sm"
          className="gap-1 min-h-[44px] sm:min-h-9 w-full sm:w-auto"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          <Sparkles className="h-4 w-4" />
          AI 할일 파악 (5일치)
        </Button>
      </div>
      <TaskBoard />
    </div>
  );
}
