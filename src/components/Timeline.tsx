import type { BoardAction } from '../state/board';
import type { BoardState } from '../types';

interface TimelineProps {
  state: BoardState;
  dispatch: (action: BoardAction) => void;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
}

export function Timeline({ state, dispatch, playing, onPlay, onStop }: TimelineProps) {
  return (
    <div className="timeline">
      <button
        className="capture"
        title="Snapshot current positions as a new keyframe"
        onClick={() => dispatch({ type: 'CAPTURE_FRAME' })}
      >
        + Capture frame
      </button>
      <button
        disabled={state.activeFrame < 0 || state.frames.length === 0}
        title="Overwrite the selected frame with the current positions"
        onClick={() => dispatch({ type: 'UPDATE_FRAME' })}
      >
        Update frame
      </button>

      <div className="frames" role="list" aria-label="Frames">
        {state.frames.length === 0 && (
          <span className="frames-empty">
            Position the players, then capture frames to build an animated play.
          </span>
        )}
        {state.frames.map((f, i) => (
          <span key={f.id} className="frame-chip" role="listitem">
            <button
              className={i === state.activeFrame ? 'active' : ''}
              onClick={() => dispatch({ type: 'SELECT_FRAME', index: i })}
              title={`Load frame ${i + 1}`}
            >
              {i + 1}
            </button>
            <button
              className="frame-delete"
              aria-label={`Delete frame ${i + 1}`}
              onClick={() => dispatch({ type: 'DELETE_FRAME', index: i })}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {playing ? (
        <button className="play" onClick={onStop}>
          ■ Stop
        </button>
      ) : (
        <button
          className="play"
          disabled={state.frames.length < 2}
          title={state.frames.length < 2 ? 'Capture at least 2 frames to play' : 'Animate the play'}
          onClick={onPlay}
        >
          ▶ Play
        </button>
      )}
    </div>
  );
}
