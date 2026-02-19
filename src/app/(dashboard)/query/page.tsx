'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Search, Database } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/api';
import Link from 'next/link';

export default function QueryPage() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [noEmbeddings, setNoEmbeddings] = useState(false);
  const [sources, setSources] = useState<Array<{ logId: string; content: string; date: string; projectName: string | null }>>([]);

  const { mutate: ask, isPending } = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) {
        const msg = await getApiErrorMessage(res, '질의 실패');
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setAnswer(data.answer);
      setSources(data.sources || []);
      setNoEmbeddings(!!data.noEmbeddings);
      toast.success(data.noEmbeddings ? '임베딩 생성이 필요합니다.' : '답변을 생성했습니다.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { mutate: syncEmbeddings, isPending: syncPending } = useMutation({
    mutationFn: async () => {
      let total = 0;
      let remaining = 1;
      while (remaining > 0) {
        const res = await fetch('/api/embeddings/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const msg = await getApiErrorMessage(res, '임베딩 생성 실패');
          throw new Error(msg);
        }
        const data = await res.json();
        total += data.created ?? 0;
        remaining = data.remaining ?? 0;
      }
      return total;
    },
    onSuccess: (n) => {
      setNoEmbeddings(false);
      toast.success(`임베딩 ${n}건 생성 완료. 다시 질의해 보세요.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.error('질문을 입력하세요.');
      return;
    }
    ask(query.trim());
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-semibold">자연어 질의 (RAG)</h1>
      <p className="text-muted-foreground text-sm">
        로그를 기반으로 질문에 답합니다. 예: &quot;서센 사용승인은 언제 제출했어?&quot;
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="질문을 입력하세요"
          rows={3}
          disabled={isPending}
          className="min-h-[80px] w-full text-base"
        />
        <Button
          type="submit"
          disabled={isPending || !query.trim()}
          className="gap-1 min-h-[44px] sm:min-h-9 w-full sm:w-auto"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          <Search className="h-4 w-4" />
          질의
        </Button>
      </form>

      {answer && (
        <div className="space-y-4">
          <div className="border rounded-lg p-3 sm:p-4 bg-card">
            <p className="text-sm font-medium text-muted-foreground mb-2">답변</p>
            <p className="whitespace-pre-wrap">{answer}</p>
            {noEmbeddings && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 gap-1 min-h-[44px] sm:min-h-9"
                disabled={syncPending}
                onClick={() => syncEmbeddings()}
              >
                {syncPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Database className="h-4 w-4" />
                임베딩 생성
              </Button>
            )}
          </div>
          {sources.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">참고 로그</p>
              <ul className="space-y-2">
                {sources.map((s) => (
                  <li key={s.logId} className="text-sm border rounded p-3 min-h-[44px] flex items-center">
                    <Link href={`/logs/${s.logId}`} className="text-primary hover:underline block w-full">
                      [{s.date}] {s.projectName || '-'}: {s.content.slice(0, 80)}…
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
