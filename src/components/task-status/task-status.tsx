'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2, Download, RefreshCw } from 'lucide-react';
import { cacheImageUrl, cn } from '@/lib/utils';

interface TaskStatusProps {
  taskId: string | null;
  onComplete?: (images: string[]) => void;
  className?: string;
}

interface TaskState {
  status: 'pending' | 'processing' | 'completed' | 'failed' | null;
  progress: number;
  error: string | null;
  images: string[];
}

export function TaskStatus({ taskId, onComplete, className }: TaskStatusProps) {
  const [task, setTask] = useState<TaskState>({
    status: null,
    progress: 0,
    error: null,
    images: [],
  });
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (!taskId) {
      setTask({ status: null, progress: 0, error: null, images: [] });
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        if (!res.ok) return;
        const data = await res.json();

        if (cancelled) return;

        const images: string[] = data.result?.images || [];

        setTask({
          status: data.status,
          progress: data.progress || 0,
          error: data.error,
          images,
        });

        if (data.status === 'completed') {
          clearInterval(intervalId);
          onComplete?.(images);
        } else if (data.status === 'failed') {
          clearInterval(intervalId);
        }

        setPollCount((c) => c + 1);
      } catch {
        // Network error, will retry
      }
    };

    poll();
    intervalId = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [taskId, onComplete]);

  if (!taskId || !task.status) return null;

  if (task.status === 'pending' || task.status === 'processing') {
    return (
      <div className={cn('bg-blue-50 border border-blue-200 rounded-xl p-6', className)}>
        <div className="flex items-center gap-3 mb-3">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <span className="font-medium text-blue-900">
            {task.status === 'pending' ? '排队中...' : 'AI生成中...'}
          </span>
          <span className="text-sm text-blue-600 ml-auto">{task.progress}%</span>
        </div>
        <div className="w-full bg-blue-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${task.progress}%` }}
          />
        </div>
        <p className="text-xs text-blue-500 mt-2">
          通常需要10-30秒，请耐心等待... (已轮询{pollCount}次)
        </p>
      </div>
    );
  }

  if (task.status === 'failed') {
    return (
      <div className={cn('bg-red-50 border border-red-200 rounded-xl p-6', className)}>
        <div className="flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-600" />
          <span className="font-medium text-red-900">生成失败</span>
        </div>
        <p className="text-sm text-red-600 mt-2">{task.error || '未知错误'}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800"
        >
          <RefreshCw className="w-4 h-4" /> 重新开始
        </button>
      </div>
    );
  }

  if (task.status === 'completed') {
    return (
      <div className={cn('bg-green-50 border border-green-200 rounded-xl p-6', className)}>
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="font-medium text-green-900">生成完成！</span>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {task.images.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={cacheImageUrl(img)}
                alt={`结果 ${i + 1}`}
                className="w-full rounded-lg border border-green-200"
              />
              <a
                href={img}
                download
                className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-black/70 hover:bg-black/90 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Download className="w-4 h-4" /> 下载
              </a>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
