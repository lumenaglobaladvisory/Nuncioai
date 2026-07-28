"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckSquare, CalendarDays } from "lucide-react";
import type { CalendarEvent, Task } from "@prisma/client";
import { apiFetch } from "@/lib/api-client";
import Badge from "./Badge";
import Button from "./Button";

type TaskWithThread = Task & { thread: { subject: string } | null };
type EventWithThread = CalendarEvent & { thread: { subject: string } | null };

export default function TasksClient({
  initialTasks,
  initialEvents,
}: {
  initialTasks: TaskWithThread[];
  initialEvents: EventWithThread[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [creating, setCreating] = useState(false);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await apiFetch("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ title, dueDate: dueDate || undefined, priority }),
      });
      setTitle("");
      setDueDate("");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(task: Task, status: string) {
    setBusy(task.id);
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteTask(task: Task) {
    setBusy(task.id);
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function deleteEvent(event: CalendarEvent) {
    setBusy(event.id);
    try {
      await apiFetch(`/api/events/${event.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const openTasks = initialTasks.filter((t) => t.status === "open");
  const doneTasks = initialTasks.filter((t) => t.status !== "open");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Tasks &amp; Calendar</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Tasks and events extracted from email threads, plus anything you add directly.
        </p>
      </div>

      <section className="space-y-3">
        <form
          onSubmit={addTask}
          className="flex flex-wrap items-end gap-2 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-100"
        >
          <div className="flex-1">
            <label className="text-xs font-medium text-neutral-500">New task</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Send updated proposal to Acme"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500">Due</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </div>
          <Button type="submit" disabled={creating}>
            Add
          </Button>
        </form>

        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
          <CheckSquare className="h-3.5 w-3.5 text-neutral-400" strokeWidth={2.25} />
          Open ({openTasks.length})
        </h2>
        <div className="space-y-2">
          {openTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm shadow-neutral-100"
            >
              <div>
                <p className="text-sm text-neutral-900">{task.title}</p>
                <p className="text-xs text-neutral-400">
                  {task.thread && (
                    <Link href={`/threads/${task.threadId}`} className="hover:underline">
                      {task.thread.subject}
                    </Link>
                  )}
                  {task.dueDate && ` · due ${new Date(task.dueDate).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge label={task.priority} />
                <Button variant="secondary" size="sm" onClick={() => setStatus(task, "done")} disabled={busy === task.id}>
                  Mark done
                </Button>
                <Button variant="danger" size="sm" onClick={() => deleteTask(task)} disabled={busy === task.id}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {openTasks.length === 0 && (
            <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-400">
              No open tasks.
            </p>
          )}
        </div>

        {doneTasks.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-neutral-400">{doneTasks.length} completed/dismissed</summary>
            <div className="mt-2 space-y-1.5">
              {doneTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-100 bg-white px-4 py-2 text-sm text-neutral-400"
                >
                  <span className="line-through">{task.title}</span>
                  <Badge label={task.status} />
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
          <CalendarDays className="h-3.5 w-3.5 text-neutral-400" strokeWidth={2.25} />
          Calendar events ({initialEvents.length})
        </h2>
        <div className="space-y-2">
          {initialEvents.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm shadow-neutral-100"
            >
              <div>
                <p className="text-sm text-neutral-900">{event.title}</p>
                <p className="text-xs text-neutral-400">
                  {new Date(event.startTime).toLocaleString()} - {new Date(event.endTime).toLocaleTimeString()}
                  {event.thread && (
                    <>
                      {" · "}
                      <Link href={`/threads/${event.threadId}`} className="hover:underline">
                        {event.thread.subject}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge label={event.status} />
                <Button variant="danger" size="sm" onClick={() => deleteEvent(event)} disabled={busy === event.id}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {initialEvents.length === 0 && (
            <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-400">
              No events yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
