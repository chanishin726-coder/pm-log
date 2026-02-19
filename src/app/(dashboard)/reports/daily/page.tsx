'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, FileText, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getApiErrorMessage } from '@/lib/api';

export default function DailyReportPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const { data: report, isLoading } = useQuery({
    queryKey: ['dailyReport', date],
    queryFn: async () => {
      const res = await fetch(`/api/reports/daily?date=${date}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { mutate: generate, isPending: generating } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/generate-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const msg = await getApiErrorMessage(res, '생성 실패');
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyReport', date] });
      toast.success('일지가 생성되었습니다.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { mutate: saveReport, isPending: saving } = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch('/api/reports/daily', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, content }),
      });
      if (!res.ok) {
        const msg = await getApiErrorMessage(res, '저장 실패');
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyReport', date] });
      setEditing(false);
      toast.success('일지가 저장되었습니다.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = () => {
    if (report?.content != null) {
      setEditContent(report.content);
      setEditing(true);
    }
  };

  const handleSave = () => {
    saveReport(editContent);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const { mutate: deleteReport, isPending: deleting } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/reports/daily?date=${encodeURIComponent(date)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const msg = await getApiErrorMessage(res, '삭제 실패');
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyReport', date] });
      toast.success('일지가 삭제되었습니다.');
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = () => {
    if (window.confirm('이 날짜의 일지를 삭제할까요? 삭제하면 복구할 수 없습니다.')) {
      deleteReport();
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-semibold">업무 일지</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full sm:w-40 min-h-[44px] sm:min-h-9"
          />
          <Button
            onClick={() => generate()}
            disabled={generating}
            size="sm"
            className="gap-1 min-h-[44px] sm:min-h-9"
          >
            {generating && <Loader2 className="h-4 w-4 animate-spin" />}
            <FileText className="h-4 w-4" />
            일지 생성
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">불러오는 중...</p>
      ) : !report ? (
        <p className="text-muted-foreground">
          해당 날짜의 일지가 없습니다. &quot;일지 생성&quot;을 눌러 AI가 로그를 바탕으로
          작성합니다.
        </p>
      ) : editing ? (
        <div className="border rounded-lg p-4 sm:p-6 bg-card space-y-4">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="일지 본문"
            rows={20}
            className="min-h-[320px] font-sans text-sm whitespace-pre-wrap resize-y"
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              저장
            </Button>
          </div>
        </div>
      ) : (
        <article className="border rounded-lg p-4 sm:p-6 bg-card">
          <div className="flex justify-end gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={startEdit} className="gap-1 min-h-[44px] sm:min-h-9">
              <Pencil className="h-4 w-4" />
              수정
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1 min-h-[44px] sm:min-h-9 text-destructive hover:text-destructive"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              삭제
            </Button>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{report.content}</div>
        </article>
      )}
    </div>
  );
}
