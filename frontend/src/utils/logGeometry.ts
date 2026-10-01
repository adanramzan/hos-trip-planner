/** x position of an hour-of-day (0–24) inside a log-sheet graph starting at `gridLeft`, `gridWidth` wide. */
export const hourToX = (hour: number, gridLeft: number, gridWidth: number) => gridLeft + (hour / 24) * gridWidth
