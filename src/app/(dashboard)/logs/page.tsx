'use client';

import { useState } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { QuickInput } from '@/components/logs/QuickInput';
import { Badge } from '@/components/ui/badge';
import { NO_PROJECT_FILTER_VALUE, NO_PROJECT_LABEL } from '@/lib/utils';
import { getTaskState, getTaskStateLabel } from '@/lib/task-state';
import type { Log } from '@/types/database';

const LOGS_PAGE_SIZE = 50;

export default function LogsPage() {
  const [projectId, setProjectId] = useState('');
  const [logType, setLogType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [taskIdTag, setTaskIdTag] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [source, setSource] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    },
  });

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['logs', projectId, logType, keyword, taskIdTag, categoryCode, source],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set('limit', String(LOGS_PAGE_SIZE));
      params.set('offset', String(pageParam));
      if (projectId) params.set('projectId', projectId);
      if (logType) params.set('logType', logType);
      if (keyword) params.set('keyword', keyword);
      if (taskIdTag) params.set('taskIdTag', taskIdTag);
      if (categoryCode) params.set('categoryCode', categoryCode);
      if (source) params.set('source', source);
      const res = await fetch(`/api/logs?${params}`);
      if (!res.ok) throw new Error('Failed to fetch logs');
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      (lastPage as Log[]).length === LOGS_PAGE_SIZE
        ? allPages.length * LOGS_PAGE_SIZE
        : undefined,
  });

  const logs = (data?.pages ?? []).flat() as Log[];

  return (
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-semibold">로그</h1>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <Input
          placeholder="키워드"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="w-full sm:w-36 min-h-[44px] sm:min-h-9"
        />
        <Input
          placeholder="할일 태그 (task_id_tag)"
          value={taskIdTag}
          onChange={(e) => setTaskIdTag(e.target.value)}
          className="w-full sm:w-36 min-h-[44px] sm:min-h-9"
        />
        <Input
          placeholder="카테고리 코드"
          value={categoryCode}
          onChange={(e) => setCategoryCode(e.target.value)}
          className="w-full sm:w-32 min-h-[44px] sm:min-h-9"
        />
        <Input
          placeholder="발신/대상 (source)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="w-full sm:w-36 min-h-[44px] sm:min-h-9"
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="border rounded-md px-3 py-2.5 text-sm min-h-[44px] sm:min-h-9 w-full sm:w-auto"
        >
          <option value="">전체 프로젝트</option>
          <option value={NO_PROJECT_FILTER_VALUE}>{NO_PROJECT_LABEL}</option>
          {(projects as { id: string; name: string }[]).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={logType}
          onChange={(e) => setLogType(e.target.value)}
          className="border rounded-md px-3 py-2.5 text-sm min-h-[44px] sm:min-h-9 w-full sm:w-auto"
        >
          <option value="">전체 타입</option>
          <option value="F">F 수신</option>
          <option value="T">T 발신</option>
          <option value="W">W 실행</option>
          <option value="I">I 정보</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] sm:min-h-9 w-full sm:w-auto"
          onClick={() => { setProjectId(''); setLogType(''); setKeyword(''); setTaskIdTag(''); setCategoryCode(''); setSource(''); }}
        >
          초기화
        </Button>
      </div>

      <section>
        <h2 className="text-base sm:text-lg font-medium mb-2">빠른 입력</h2>
        <QuickInput />
      </section>

      <section>
        <h2 className="text-base sm:text-lg font-medium mb-2">목록</h2>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">불러오는 중...</p>
        ) : logs.length === 0 ? (
          <p className="text-muted-foreground text-sm">로그가 없습니다.</p>
        ) : (
          <>
          <ul className="space-y-0 border rounded-lg divide-y overflow-hidden">
            {logs.map((log) => {
              const logWithState = log as Log & { task_state?: string | null };
              const hasTask = logWithState.task_state != null || log.task_id_tag != null;
              const taskState = hasTask ? getTaskState(logWithState) : null;
              return (
                <li key={log.id} className="p-3 sm:p-4 hover:bg-muted/50 active:bg-muted/70 min-h-[52px] flex items-center">
                  <Link href={`/logs/${log.id}`} className="block w-full">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground text-sm">{log.log_date}</span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {log.log_type}
                      </Badge>
                      <span className="text-sm font-medium">{log.project?.name ?? NO_PROJECT_LABEL}</span>
                      {log.category_code && (
                        <span className="text-xs text-muted-foreground">{log.category_code}</span>
                      )}
                      {taskState != null && (
                        <Badge variant="outline" className="text-xs">
                          {getTaskStateLabel(taskState)}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm truncate">
                      {log.source && <span className="text-muted-foreground">{log.source}: </span>}
                      {log.content}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
          {hasNextPage && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? '불러오는 중…' : '더 보기'}
              </Button>
            </div>
          )}
        </>
        )}
      </section>
    </div>
  );
}
