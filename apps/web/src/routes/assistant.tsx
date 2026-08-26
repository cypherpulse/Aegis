import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowRight, Bot, Loader2, Sparkles, User as UserIcon } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { aegisApi } from "@/services/api";
import { cn } from "@/lib/utils";
import type { AssistantAction, AssistantReply } from "@/types/api";

export const Route = createFileRoute("/assistant")({
  head: () => ({ meta: [{ title: "Assistant — Aegis" }] }),
  component: AssistantPage,
});

interface Msg {
  role: "user" | "assistant";
  text: string;
  mode?: "harness" | "local";
  actions?: AssistantAction[];
}

const SUGGESTIONS = [
  "Summarize my open incidents and their severity.",
  "Analyze my most recent incident and its root cause.",
  "What evidence supports the latest treasury finding?",
];

function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "I'm the Aegis Assistant. Ask me to analyze your incidents, explain a root cause, or investigate one — reference an incident by its INC_ id and I can launch a real investigation.",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = useMutation({
    mutationFn: (message: string) => aegisApi.assistantChat(message),
    onSuccess: (res: AssistantReply) => {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: res.reply, mode: res.mode, actions: res.actions },
      ]);
      queueMicrotask(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
      );
    },
    onError: (err) =>
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `Sorry — I couldn't process that. ${err instanceof Error ? err.message : ""}`,
        },
      ]),
  });

  const send = (text: string) => {
    const msg = text.trim();
    if (!msg || chat.isPending) return;
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setInput("");
    chat.mutate(msg);
    queueMicrotask(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
    );
  };

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Assistant</h1>
          <p className="font-mono text-[11px] text-muted-foreground">
            Agentic analysis over your incidents — powered by TrueForge
          </p>
        </div>
      </div>

      <div className="flex h-[calc(100vh-13rem)] flex-col rounded-xl border border-border bg-card">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md",
                  m.role === "user" ? "bg-accent" : "bg-primary/10 text-primary",
                )}
              >
                {m.role === "user" ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
              </div>
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background",
                )}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.actions && m.actions.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {m.actions.map((a, j) => (
                      <Link
                        key={j}
                        to="/incidents/$incidentId"
                        params={{ incidentId: a.incidentId }}
                        className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 font-mono text-[11px] text-foreground hover:bg-accent"
                      >
                        {a.type === "investigation_started"
                          ? "Investigation launched"
                          : a.type === "investigation_active"
                            ? "Investigation in progress"
                            : a.type}
                        : {a.incidentId} <ArrowRight className="size-3" />
                      </Link>
                    ))}
                  </div>
                ) : null}
                {m.role === "assistant" && m.mode ? (
                  <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {m.mode === "harness" ? "TrueForge · aegis-commander" : "local data mode"}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
          {chat.isPending ? (
            <div className="flex gap-3">
              <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Bot className="size-4" />
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Thinking…
              </div>
            </div>
          ) : null}
        </div>

        {messages.length <= 1 ? (
          <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your incidents, or say 'investigate INC_…'"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={chat.isPending || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Send <ArrowRight className="size-4" />
          </button>
        </form>
      </div>
    </AppShell>
  );
}
