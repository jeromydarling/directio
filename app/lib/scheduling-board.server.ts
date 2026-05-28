/**
 * Notify the per-organization SchedulingBoard Durable Object that
 * something changed. Mutation routes call this after their D1 write
 * succeeds; the DO fans the event out to every connected admin /
 * parent / instructor client.
 *
 * Best-effort: errors are swallowed and logged. The DB write is
 * authoritative — live updates are a nicety, not a correctness
 * guarantee.
 */

export type BoardEvent =
  | { kind: "appointment.created"; orgId: string; appointmentId: string; startsAt: number; endsAt: number; instructorId: string | null; vehicleId: string | null; status: string }
  | { kind: "appointment.canceled"; orgId: string; appointmentId: string }
  | { kind: "appointment.completed"; orgId: string; appointmentId: string }
  | { kind: "appointment.no_show"; orgId: string; appointmentId: string }
  | { kind: "shift.started"; orgId: string; vehicleId: string; instructorId: string; shiftId: string }
  | { kind: "shift.ended"; orgId: string; vehicleId: string; instructorId: string; shiftId: string; flagged: boolean }
  | { kind: "series.created"; orgId: string; seriesId: string; lessonCount: number };

export async function notifyBoard(env: Env, event: BoardEvent): Promise<void> {
  try {
    const id = env.SCHEDULING_BOARD.idFromName(event.orgId);
    const stub = env.SCHEDULING_BOARD.get(id);
    await stub.fetch("https://internal/notify", {
      method: "POST",
      body: JSON.stringify({ ...event, at: Date.now() }),
    });
  } catch (err) {
    console.warn("[scheduling-board] notify failed:", err);
  }
}
