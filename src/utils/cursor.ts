export interface CursorData {
  timestamp: string;
  id: number;
}

export function encodeCursor(timestamp: string, id: number): string {
  return Buffer.from(`${timestamp}#${id}`).toString("base64");
}

export function decodeCursor(cursorStr: string): CursorData | null {
  try {
    const decoded = Buffer.from(cursorStr, "base64").toString("utf-8");
    const parts = decoded.split("#");
    if (parts.length !== 2) return null;

    const [timestamp, idStr] = parts;
    const id = parseInt(idStr, 10);

    if (!timestamp || isNaN(id) || isNaN(Date.parse(timestamp))) {
      return null;
    }

    return { timestamp, id };
  } catch {
    return null;
  }
}
