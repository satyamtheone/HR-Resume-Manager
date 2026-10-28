import type { Metadata } from "next";
import "./styles.css";
import "./tailwind.css";
export const metadata: Metadata = {
  title: "HR Resume Manager",
  description:
    "A private workspace for parsing resumes and managing candidate profiles",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
