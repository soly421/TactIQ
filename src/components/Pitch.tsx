import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { uid, type BoardAction } from '../state/board';
import {
  BALL_ID,
  PITCH_H,
  PITCH_W,
  type Arrow,
  type ArrowKind,
  type BoardState,
  type Point,
} from '../types';

const TOKEN_R = 14;

interface PitchProps {
  state: BoardState;
  dispatch: (action: BoardAction) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}

interface Draft {
  kind: ArrowKind;
  from: Point;
  to: Point;
}

export function Pitch({ state, dispatch, svgRef }: PitchProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const dragId = useRef<string | null>(null);

  // The viewBox is the pitch plus a 30-unit margin on every side.
  const toBoard = (e: PointerEvent<SVGSVGElement>): Point => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * (PITCH_W + 60) - 30,
      y: ((e.clientY - rect.top) / rect.height) * (PITCH_H + 60) - 30,
    };
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const p = toBoard(e);
    const tokenId = (e.target as Element).closest('[data-token]')?.getAttribute('data-token');

    if (state.tool === 'select') {
      if (!tokenId) return;
      dragId.current = tokenId;
      svgRef.current!.setPointerCapture(e.pointerId);
    } else if (state.tool === 'run' || state.tool === 'pass') {
      setDraft({ kind: state.tool, from: p, to: p });
      svgRef.current!.setPointerCapture(e.pointerId);
    } else if (state.tool === 'erase') {
      const arrowId = (e.target as Element).closest('[data-arrow]')?.getAttribute('data-arrow');
      if (arrowId) dispatch({ type: 'REMOVE_ARROW', id: arrowId });
    }
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const p = toBoard(e);
    if (dragId.current) {
      dispatch({ type: 'MOVE_TOKEN', id: dragId.current, x: p.x, y: p.y });
    } else if (draft) {
      setDraft({ ...draft, to: p });
    }
  };

  const onPointerUp = () => {
    dragId.current = null;
    if (draft) {
      const dx = draft.to.x - draft.from.x;
      const dy = draft.to.y - draft.from.y;
      if (Math.hypot(dx, dy) > 15) {
        const arrow: Arrow = { id: uid('arrow'), ...draft };
        dispatch({ type: 'ADD_ARROW', arrow });
      }
      setDraft(null);
    }
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`-30 -30 ${PITCH_W + 60} ${PITCH_H + 60}`}
      className="pitch"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="img"
      aria-label="Soccer tactics board"
    >
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="context-stroke" />
        </marker>
      </defs>

      <PitchMarkings />

      {state.arrows.map((a) => (
        <ArrowLine key={a.id} arrow={a} erasable={state.tool === 'erase'} />
      ))}
      {draft && <ArrowLine arrow={{ id: 'draft', ...draft }} erasable={false} />}

      {state.players.map((p) => (
        <g
          key={p.id}
          data-token={p.id}
          transform={`translate(${p.x} ${p.y})`}
          style={{ cursor: state.tool === 'select' ? 'grab' : 'default' }}
        >
          <circle
            r={TOKEN_R}
            fill={p.team === 'home' ? '#e63946' : '#1d6fd8'}
            stroke="#ffffff"
            strokeWidth="2.5"
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="13"
            fontWeight="700"
            fill="#ffffff"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {p.number}
          </text>
        </g>
      ))}

      <g
        data-token={BALL_ID}
        transform={`translate(${state.ball.x} ${state.ball.y})`}
        style={{ cursor: state.tool === 'select' ? 'grab' : 'default' }}
      >
        <circle r={8} fill="#ffffff" stroke="#111111" strokeWidth="2" />
        <circle r={3} fill="#111111" />
      </g>
    </svg>
  );
}

function ArrowLine({ arrow, erasable }: { arrow: Arrow; erasable: boolean }) {
  const color = arrow.kind === 'run' ? '#ffd166' : '#f1f5f9';
  return (
    <g data-arrow={arrow.id} style={{ cursor: erasable ? 'pointer' : 'default' }}>
      {/* invisible fat line so erasing doesn't require pixel-perfect clicks */}
      <line
        x1={arrow.from.x}
        y1={arrow.from.y}
        x2={arrow.to.x}
        y2={arrow.to.y}
        stroke="transparent"
        strokeWidth="18"
      />
      <line
        x1={arrow.from.x}
        y1={arrow.from.y}
        x2={arrow.to.x}
        y2={arrow.to.y}
        stroke={color}
        strokeWidth="4"
        strokeDasharray={arrow.kind === 'pass' ? '10 8' : undefined}
        markerEnd="url(#arrowhead)"
      />
    </g>
  );
}

function PitchMarkings() {
  const line = { stroke: '#ffffff', strokeWidth: 3, fill: 'none' } as const;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={-30} y={-30} width={PITCH_W + 60} height={PITCH_H + 60} fill="#1a7a3a" />
      {/* mowing stripes */}
      {Array.from({ length: 7 }, (_, i) => (
        <rect
          key={i}
          x={(PITCH_W / 7) * i}
          y={0}
          width={PITCH_W / 14}
          height={PITCH_H}
          fill="#ffffff"
          opacity={0.05}
        />
      ))}
      <rect x={0} y={0} width={PITCH_W} height={PITCH_H} {...line} />
      <line x1={PITCH_W / 2} y1={0} x2={PITCH_W / 2} y2={PITCH_H} {...line} />
      <circle cx={PITCH_W / 2} cy={PITCH_H / 2} r={91.5} {...line} />
      <circle cx={PITCH_W / 2} cy={PITCH_H / 2} r={4} fill="#ffffff" />
      {/* penalty areas, goal areas, spots, arcs — mirrored for both ends */}
      {([0, 1] as const).map((end) => {
        const mirror = (x: number) => (end === 0 ? x : PITCH_W - x);
        const boxX = end === 0 ? 0 : PITCH_W - 165;
        const goalX = end === 0 ? 0 : PITCH_W - 55;
        const arcSweep = end === 0 ? 1 : 0;
        return (
          <g key={end}>
            <rect x={boxX} y={PITCH_H / 2 - 201.5} width={165} height={403} {...line} />
            <rect x={goalX} y={PITCH_H / 2 - 91.5} width={55} height={183} {...line} />
            <circle cx={mirror(110)} cy={PITCH_H / 2} r={4} fill="#ffffff" />
            <path
              d={`M ${mirror(165)} ${PITCH_H / 2 - 74.5} A 91.5 91.5 0 0 ${arcSweep} ${mirror(165)} ${PITCH_H / 2 + 74.5}`}
              {...line}
            />
            <rect
              x={end === 0 ? -12 : PITCH_W}
              y={PITCH_H / 2 - 36.6}
              width={12}
              height={73.2}
              {...line}
            />
          </g>
        );
      })}
    </g>
  );
}
