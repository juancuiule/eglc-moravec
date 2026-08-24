type Props = { videoId: string; title: string };

export function YouTubeEmbed({ videoId, title }: Props) {
  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-base">
      <iframe
        key={videoId}
        className="w-full h-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
