import type { ChatMessage, Side } from "@/lib/chat/types";
import { fmtTime } from "@/lib/mae/time";
import { cn } from "@/lib/utils";

export function LiveBubble({ message, mine, side }: { message: ChatMessage; mine: boolean; side: Side }) {
  return (
    <div className={cn("flex w-full px-3 py-1", mine ? "justify-start" : "justify-end")}>
      <div className={cn("max-w-[82%] min-w-20 rounded-2xl border px-3.5 py-2 text-[15px] leading-7",
        mine ? "rounded-tr-md" : "rounded-tl-md",
        side === "M" ? "border-mahan/40 bg-mahan/15" : "border-elisa/40 bg-elisa/15")}>
        {!mine && <p className={cn("text-xs font-bold", side === "M" ? "text-mahan" : "text-elisa")}>{side === "M" ? "ماهان" : "الیسا"}</p>}
        {message.body && <p dir="auto" className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</p>}
        {message.kind !== "text" && <p className="text-xs text-muted-foreground">پیام رسانه‌ای</p>}
        <p className="mt-1 text-end text-[10px] text-muted-foreground">{fmtTime(Date.parse(message.created_at))}{message.edited_at && " · ویرایش‌شده"}</p>
      </div>
    </div>
  );
}