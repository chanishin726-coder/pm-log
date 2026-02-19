'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage } from '@/lib/api';

export function QuickInput() {
  const [text, setText] = useState('');
  const queryClient = useQueryClient();

  const { mutate: saveLog, isPending } = useMutation({
    mutationFn: async (rawInput: string) => {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawInput }),
      });

      if (!res.ok) {
        const msg = await getApiErrorMessage(res, '저장 실패');
        throw new Error(msg);
      }

      return res.json();
    },
    onSuccess: (data: unknown) => {
      setText('');
      const count = Array.isArray(data) ? data.length : 1;
      toast.success(count > 1 ? `${count}건 저장 완료` : '저장 완료');
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = () => {
    if (!text.trim()) return;
    saveLog(text.trim());
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="서센 F H7 문장근부장 사용승인 서류 제출함"
        className="min-h-[80px] resize-none w-full text-base"
        rows={3}
        disabled={isPending}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs text-muted-foreground order-2 sm:order-1">
          형식: [프로젝트코드] [F/T/W/I] [카테고리코드?] [내용] · ⌘Enter 저장
        </p>
        <Button
          onClick={handleSubmit}
          disabled={isPending || !text.trim()}
          size="sm"
          className="min-h-[44px] w-full sm:w-auto sm:min-h-0 order-1 sm:order-2"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? '처리 중...' : '저장'}
        </Button>
      </div>
    </div>
  );
}
