import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";
import { useState } from "react";

export type ReplyTone = "professional" | "friendly" | "formal" | "confident" | "enthusiastic" | "neutral";
export type ReplyLength = "short" | "medium" | "detailed";

export function ReplyAssistantModal({
  open,
  onOpenChange,
  onGenerate,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onGenerate: (opts: { tone: ReplyTone; length: ReplyLength; instruction: string }) => void;
  pending: boolean;
}) {
  const [tone, setTone] = useState<ReplyTone>("professional");
  const [length, setLength] = useState<ReplyLength>("medium");
  const [instruction, setInstruction] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI Reply Assistant</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tone</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {(["professional", "friendly", "formal", "confident", "enthusiastic", "neutral"] as ReplyTone[]).map((t) => (
                <Button key={t} type="button" size="sm" variant={tone === t ? "default" : "outline"} onClick={() => setTone(t)}>
                  {t[0].toUpperCase() + t.slice(1)}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>Length</Label>
            <div className="flex gap-1 mt-1">
              {(["short", "medium", "detailed"] as ReplyLength[]).map((l) => (
                <Button key={l} type="button" size="sm" variant={length === l ? "default" : "outline"} onClick={() => setLength(l)}>
                  {l[0].toUpperCase() + l.slice(1)}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>Custom instructions (optional)</Label>
            <Textarea
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. Politely decline and suggest reconnecting in Q4. Ask about interview timeline. Confirm availability next Tuesday."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onGenerate({ tone, length, instruction: instruction.trim() })} disabled={pending}>
            <Sparkles className="h-4 w-4 mr-2" /> {pending ? "Drafting…" : "Generate draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
