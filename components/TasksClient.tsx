"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CalendarEvent, Task } from "@prisma/client";
import { apiFetch } from "@/lib/api-client";
import Badge from "./Badge";

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
        <h1 className="text-xl font-semibold text-neutral-900">Tasks &amp; Calendar</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Tasks and events extracted from email threads, plus anything you add directly.
        </p>
      </div>

      <section className="space-y-3">
        <form onSubmit={addTask} className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex-1">
            <label className="text-xs font-medium text-neutral-500">New task</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Send updated proposal to Acme"
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500">Due</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="mt-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <h2 className="text-sm font-semibold text-neutral-700">Open ({openTasks.length})</h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {openTasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
                <button
                  onClick={() => setStatus(task, "done")}
                  disabled={busy === task.id}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
                >
                  Mark done
                </button>
                <button
                  onClick={() => deleteTask(task)}
                  disabled={busy === task.id}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {openTasks.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-400">No open tasks.</li>}
        </ul>

        {doneTasks.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-neutral-400">{doneTasks.length} completed/dismissed</summary>
            <ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
              {doneTasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between px-4 py-2 text-sm text-neutral-400">
                  <span className="line-through">{task.title}</span>
                  <Badge label={task.status} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">Calendar events ({initialEvents.length})</h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {initialEvents.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
                <button
                  onClick={() => deleteEvent(event)}
                  disabled={busy === event.id}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {initialEvents.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-400">No events yet.</li>}
        </ul>
      </section>
    </div>
  );
}
