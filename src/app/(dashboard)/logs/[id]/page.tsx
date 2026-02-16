'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Pencil, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { NO_PROJECT_LABEL } from '@/lib/utils';
import { getTaskStateLabel, type TaskState } from '@/lib/task-state';

export default function LogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editSource, setEditSource] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTaskIdTag, setEditTaskIdTag] = useState('');
  const [editLogType, setEditLogType] = useState('');
  const [editCategoryCode, setEditCategoryCode] = useState('');
  const [editTaskState, setEditTaskState] = useState<string>('');
  const [editProjectId, setEditProjectId] = useState<string>('');

  const { data: log, isLoading, error } = useQuery({
    queryKey: ['log', id],
    queryFn: async () => {
      const res = await fetch(`/api/logs/${id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    },
  });

  const { mutate: saveLog, isPending: saving } = useMutation({
    mutationFn: async (payload: { source?: string; content?: string; task_id_tag?: string | null; log_type?: string; category_code?: string | null; task_state?: TaskState | null; project_id?: string | null }) => {
      const res = await fetch(`/api/logs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '저장 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['log', id] });
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setEditing(false);
      toast.success('저장되었습니다.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { mutate: deleteLog, isPending: deleting } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/logs/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '삭제 실패');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('로그가 삭제되었습니다.');
      router.push('/logs');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = () => {
    if (window.confirm('이 로그를 삭제할까요? 삭제하면 복구할 수 없습니다.')) {
      deleteLog();
    }
  };

  const startEdit = () => {
    if (log) {
      const logWithState = log as { task_state?: string | null };
      setEditSource(log.source ?? '');
      setEditContent(log.content ?? '');
      setEditTaskIdTag(log.task_id_tag ?? '');
      setEditLogType(log.log_type ?? '');
      setEditCategoryCode(log.category_code ?? '');
      setEditTaskState(logWithState.task_state ?? '');
      setEditProjectId(log.project_id ?? '');
      setEditing(true);
    }
  };

  const handleSave = () => {
    saveLog({
      source: editSource.trim() || undefined,
      content: editContent.trim(),
      task_id_tag: editTaskIdTag.trim() || null,
      log_type: editLogType,
      category_code: editCategoryCode.trim() || null,
      task_state: editTaskState ? (editTaskState as TaskState) : null,
      project_id: editProjectId || null,
    });
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  if (isLoading) {
    return <p className="text-muted-foreground">불러오는 중...</p>;
  }

  if (error || !log) {
    return (
      <div>
        <p className="text-destructive">로그를 찾을 수 없습니다.</p>
        <Link href="/logs">
          <Button variant="link" className="mt-2">목록으로</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link href="/logs">
          <Button variant="ghost" size="sm" className="gap-1 min-h-[44px] sm:min-h-9">
            <ArrowLeft className="h-4 w-4" />
            목록
          </Button>
        </Link>
        {!editing ? (
          <div className="flex gap-2">
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
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
              취소
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              저장
            </Button>
          </div>
        )}
      </div>

      <div className="border rounded-lg p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{log.log_type}</Badge>
          <span className="font-medium">{log.project?.name ?? NO_PROJECT_LABEL}</span>
          <span className="text-muted-foreground text-sm">{log.log_date}</span>
          {log.category_code && <Badge variant="outline">{log.category_code}</Badge>}
          {(log as { task_state?: string | null }).task_state && (
            <Badge variant="outline">{getTaskStateLabel((log as { task_state: TaskState }).task_state)}</Badge>
          )}
        </div>

        <div>
          <p className="text-sm text-muted-foreground">원문</p>
          <p className="mt-1">{log.raw_input}</p>
        </div>

        {editing ? (
          <>
            <div className="space-y-2">
              <Label>프로젝트</Label>
              <select
                value={editProjectId}
                onChange={(e) => setEditProjectId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              >
                <option value="">미지정</option>
                {(projects as { id: string; name: string; code: string }[]).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>타입</Label>
              <select
                value={editLogType}
                onChange={(e) => setEditLogType(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              >
                <option value="F">F 수신</option>
                <option value="T">T 발신</option>
                <option value="W">W 실행</option>
                <option value="I">I 정보</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>카테고리 코드 (선택)</Label>
              <Input
                value={editCategoryCode}
                onChange={(e) => setEditCategoryCode(e.target.value)}
                placeholder="예: H7, E9"
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label>발신/대상 (source)</Label>
              <Input
                value={editSource}
                onChange={(e) => setEditSource(e.target.value)}
                placeholder="발신/대상"
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label>정리 내용 (content)</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="정리된 본문"
                rows={4}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label>할일 ID (task_id_tag)</Label>
              <Input
                value={editTaskIdTag}
                onChange={(e) => setEditTaskIdTag(e.target.value)}
                placeholder="예: #서센6020905"
                className="min-h-[44px] font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>할일 상태</Label>
              <select
                value={editTaskState}
                onChange={(e) => setEditTaskState(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              >
                <option value="">미분류</option>
                <option value="high">A 우선</option>
                <option value="medium">B 후순위</option>
                <option value="low">C 대기</option>
                <option value="review">D AI추천</option>
                <option value="done">X 완료</option>
              </select>
            </div>
          </>
        ) : (
          <>
            {log.source != null && log.source !== '' && (
              <div>
                <p className="text-sm text-muted-foreground">발신/대상</p>
                <p className="mt-1">{log.source}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">정리 내용</p>
              <p className="mt-1">{log.content}</p>
            </div>
            {log.task_id_tag && (
              <div>
                <p className="text-sm text-muted-foreground">할일 ID</p>
                <p className="mt-1 font-mono text-sm">{log.task_id_tag}</p>
              </div>
            )}
            {log.keywords && log.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {log.keywords.map((k: string) => (
                  <Badge key={k} variant="secondary" className="text-xs">
                    {k}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
