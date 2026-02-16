'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function SyncButton() {
  const queryClient = useQueryClient();

  const { mutate: runSync, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/logs/sync', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '동기화 실패');
      }
      return res.json();
    },
    onSuccess: (data: { projectUpdated: number; taskIdTagUpdated: number; taskStateUpdated: number }) => {
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      const parts: string[] = [];
      if (data.projectUpdated > 0) parts.push(`프로젝트 ${data.projectUpdated}건`);
      if (data.taskIdTagUpdated > 0) parts.push(`할일 태그 ${data.taskIdTagUpdated}건`);
      if (data.taskStateUpdated > 0) parts.push(`할일 상태 ${data.taskStateUpdated}건`);
      if (parts.length > 0) {
        toast.success(`통합 동기화 완료: ${parts.join(', ')}`);
      } else {
        toast.info('반영할 항목이 없습니다.');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1 min-h-[44px] sm:min-h-9"
      onClick={() => runSync()}
      disabled={isPending}
      title="프로젝트·할일 태그·할일 상태를 raw/기존 데이터 기준으로 일괄 반영합니다."
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
      통합 동기화
    </Button>
  );
}
