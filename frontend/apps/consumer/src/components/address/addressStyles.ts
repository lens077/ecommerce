import { lantern } from "@/styles/tokens";

export const addressPaperSx = {
  bgcolor: lantern.paper,
  color: lantern.ink,
  border: lantern.line,
  borderRadius: "10px",
  boxShadow: "none",
};
export const addressActionSx = { color: lantern.vermilion, textTransform: "none" } as const;
export const addressPrimarySx = {
  bgcolor: lantern.vermilion,
  color: lantern.paper,
  textTransform: "none",
  borderRadius: "6px",
  boxShadow: "none",
  "&:hover": { bgcolor: lantern.vermilionDeep, boxShadow: "none" },
} as const;
export const addressAlertSx = {
  bgcolor: lantern.paperAsh,
  color: lantern.ink,
  border: lantern.line,
  "& .MuiAlert-icon": { color: lantern.inkSoft },
};
