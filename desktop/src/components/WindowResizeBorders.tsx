export function WindowResizeBorders() {
  return (
    <div className="window-resize-borders" aria-hidden="true">
      <div className="resize-edge resize-edge-top" />
      <div className="resize-edge resize-edge-bottom" />
      <div className="resize-edge resize-edge-left" />
      <div className="resize-edge resize-edge-right" />
      <div className="resize-corner resize-corner-top-left" />
      <div className="resize-corner resize-corner-top-right" />
      <div className="resize-corner resize-corner-bottom-left" />
      <div className="resize-corner resize-corner-bottom-right" />
    </div>
  );
}
