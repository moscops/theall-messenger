type ResizeDirection =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export function WindowResizeBorders() {
  const handleMouseDown = (direction: ResizeDirection) => async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!window.electronAPI?.getBounds || !window.electronAPI?.setBounds) return;

    try {
      const initialBounds = await window.electronAPI.getBounds();
      if (!initialBounds) return;

      const startX = e.screenX;
      const startY = e.screenY;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.screenX - startX;
        const dy = moveEvent.screenY - startY;

        let newX = initialBounds.x;
        let newY = initialBounds.y;
        let newWidth = initialBounds.width;
        let newHeight = initialBounds.height;

        if (direction.includes('right')) {
          newWidth = Math.max(initialBounds.width + dx, 920);
        }
        if (direction.includes('left')) {
          const widthDelta = initialBounds.width - dx;
          if (widthDelta >= 920) {
            newWidth = widthDelta;
            newX = initialBounds.x + dx;
          }
        }
        if (direction.includes('bottom')) {
          newHeight = Math.max(initialBounds.height + dy, 600);
        }
        if (direction.includes('top')) {
          const heightDelta = initialBounds.height - dy;
          if (heightDelta >= 600) {
            newHeight = heightDelta;
            newY = initialBounds.y + dy;
          }
        }

        window.electronAPI?.setBounds?.({
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newWidth),
          height: Math.round(newHeight)
        });
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } catch {
      // Non-electron environments
    }
  };

  return (
    <div className="window-resize-borders" aria-hidden="true">
      <div className="resize-edge resize-edge-top" onMouseDown={handleMouseDown('top')} />
      <div className="resize-edge resize-edge-bottom" onMouseDown={handleMouseDown('bottom')} />
      <div className="resize-edge resize-edge-left" onMouseDown={handleMouseDown('left')} />
      <div className="resize-edge resize-edge-right" onMouseDown={handleMouseDown('right')} />
      <div className="resize-corner resize-corner-top-left" onMouseDown={handleMouseDown('top-left')} />
      <div className="resize-corner resize-corner-top-right" onMouseDown={handleMouseDown('top-right')} />
      <div className="resize-corner resize-corner-bottom-left" onMouseDown={handleMouseDown('bottom-left')} />
      <div className="resize-corner resize-corner-bottom-right" onMouseDown={handleMouseDown('bottom-right')} />
    </div>
  );
}
