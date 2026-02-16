'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';

export default function ExecutiveReportPage() {
  const [startDate, setStartDate] = useState(() =>
    format(subDays(new Date(), 6), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [summary, setSummary] = useState('');

  const { mutate: runSummarize, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '요약 실패');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSummary(data.content || '');
      toast.success('임원 보고 요약이 생성되었습니다.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-semibold">임원 보고서</h1>
      <p className="text-muted-foreground text-sm">
        선택한 기간의 일지를 250자 내외로 요약합니다.
      </p>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
        <div className="space-y-2 w-full sm:w-auto">
          <Label>시작일</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="min-h-[44px] sm:min-h-9"
          />
        </div>
        <div className="space-y-2 w-full sm:w-auto">
          <Label>종료일</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="min-h-[44px] sm:min-h-9"
          />
        </div>
        <Button
          onClick={() => runSummarize()}
          disabled={isPending}
          className="gap-1 min-h-[44px] sm:min-h-9 w-full sm:w-auto"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          <FileText className="h-4 w-4" />
          요약 생성
        </Button>
      </div>

      {summary && (
        <div className="border rounded-lg p-4 sm:p-6 bg-card whitespace-pre-wrap text-sm">
          {summary}
        </div>
      )}
    </div>
  );
}
