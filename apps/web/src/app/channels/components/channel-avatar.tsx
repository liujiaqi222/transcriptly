import { displayAvatarUrl } from "@/lib/channels/avatar";

export function ChannelAvatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string;
  avatarUrl: string | null;
  size?: "md" | "lg";
}) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  const dimensions =
    size === "lg" ? "h-16 w-16 text-2xl" : "h-11 w-11 text-base";

  return (
    <span
      aria-hidden="true"
      className={`${dimensions} grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#edf7ff] font-extrabold text-[#0872b9]`}
      data-channel-avatar
    >
      {avatarUrl ? (
        // biome-ignore lint/performance/noImgElement: channel avatars are remote YouTube imagery.
        <img
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          src={displayAvatarUrl(avatarUrl)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
