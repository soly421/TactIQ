import type { BoardAction } from '../state/board';
import { FORMATIONS } from '../formations';
import type { BoardState, Tool } from '../types';

const TOOLS: Array<{ id: Tool; label: string; hint: string }> = [
  { id: 'select', label: 'Move', hint: 'Drag players and the ball' },
  { id: 'run', label: 'Run', hint: 'Draw a solid run arrow' },
  { id: 'pass', label: 'Pass', hint: 'Draw a dashed pass arrow' },
  { id: 'erase', label: 'Erase', hint: 'Click an arrow to remove it' },
];

interface ToolbarProps {
  state: BoardState;
  dispatch: (action: BoardAction) => void;
  onSave: () => void;
  onExport: () => void;
  onReset: () => void;
}

export function Toolbar({ state, dispatch, onSave, onExport, onReset }: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-group" role="group" aria-label="Tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.hint}
            className={state.tool === t.id ? 'active' : ''}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: t.id })}
          >
            {t.label}
          </button>
        ))}
        <button title="Remove all arrows" onClick={() => dispatch({ type: 'CLEAR_ARROWS' })}>
          Clear arrows
        </button>
      </div>

      <div className="toolbar-group">
        <label className="formation-label home">
          Home
          <select
            value={state.homeFormation}
            onChange={(e) =>
              dispatch({ type: 'APPLY_FORMATION', team: 'home', name: e.target.value })
            }
          >
            {FORMATIONS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="formation-label away">
          Away
          <select
            value={state.awayFormation}
            onChange={(e) =>
              dispatch({ type: 'APPLY_FORMATION', team: 'away', name: e.target.value })
            }
          >
            {FORMATIONS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="toolbar-group">
        <button onClick={onSave} title="Save the board to this browser">
          Save
        </button>
        <button onClick={onExport} title="Download the board as a PNG image">
          Export PNG
        </button>
        <button onClick={onReset} title="Reset players, arrows and frames">
          Reset
        </button>
      </div>
    </div>
  );
}
