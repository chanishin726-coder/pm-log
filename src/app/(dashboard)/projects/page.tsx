'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@/types/database';

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { mutate: createProject, isPending } = useMutation({
    mutationFn: async (payload: { name: string; code: string; description?: string }) => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '생성 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setName('');
      setCode('');
      setDescription('');
      toast.success('프로젝트가 추가되었습니다.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      toast.error('이름과 코드를 입력하세요.');
      return;
    }
    createProject({ name: name.trim(), code: code.trim().slice(0, 4), description: description.trim() || undefined });
  };

  const { mutate: updateProject, isPending: updating } = useMutation({
    mutationFn: async ({
      id,
      name: n,
      code: c,
      description: d,
    }: {
      id: string;
      name: string;
      code: string;
      description?: string;
    }) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, code: c.trim().slice(0, 4), description: d?.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '수정 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditingId(null);
      toast.success('프로젝트가 수정되었습니다.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (p: Project) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditCode(p.code);
    setEditDescription(p.description ?? '');
  };

  const cancelEdit = () => setEditingId(null);

  const handleUpdate = (id: string) => {
    if (!editName.trim() || !editCode.trim()) {
      toast.error('이름과 코드를 입력하세요.');
      return;
    }
    updateProject({ id, name: editName.trim(), code: editCode.trim(), description: editDescription.trim() || undefined });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8">
      <h1 className="text-xl sm:text-2xl font-semibold">프로젝트</h1>

      <Card>
        <CardHeader>
          <CardTitle>새 프로젝트</CardTitle>
          <CardDescription>2~4자 코드 (예: 서센, 파고다)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">이름</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="서울센터"
                disabled={isPending}
                className="min-h-[44px] sm:min-h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">코드</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="서센"
                maxLength={4}
                disabled={isPending}
                className="min-h-[44px] sm:min-h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">설명 (선택)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="설명"
                disabled={isPending}
                className="min-h-[44px] sm:min-h-9"
              />
            </div>
            <Button type="submit" disabled={isPending} className="min-h-[44px] sm:min-h-9 w-full sm:w-auto">
              추가
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-base sm:text-lg font-medium">등록된 프로젝트</h2>
        {projects.length === 0 ? (
          <p className="text-muted-foreground text-sm">프로젝트가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {(projects as Project[]).map((p) => (
              <li
                key={p.id}
                className="p-3 sm:p-4 border rounded-lg space-y-3"
              >
                {editingId === p.id ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>이름</Label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="프로젝트명"
                        disabled={updating}
                        className="min-h-[44px] sm:min-h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>코드 (2~4자)</Label>
                      <Input
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        placeholder="서센"
                        maxLength={4}
                        disabled={updating}
                        className="min-h-[44px] sm:min-h-9 font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>설명 (선택)</Label>
                      <Input
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="설명"
                        disabled={updating}
                        className="min-h-[44px] sm:min-h-9"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={updating}>
                        취소
                      </Button>
                      <Button size="sm" onClick={() => handleUpdate(p.id)} disabled={updating} className="gap-1">
                        {updating && <Loader2 className="h-4 w-4 animate-spin" />}
                        저장
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-muted-foreground font-mono text-sm">
                        {p.code}
                      </span>
                      {p.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {p.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{p.status}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(p)}
                        className="gap-1 min-h-[44px] sm:min-h-9"
                      >
                        <Pencil className="h-4 w-4" />
                        수정
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
