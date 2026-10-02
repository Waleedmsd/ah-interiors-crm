'use client';
import { Check, Layers, Move, PanelLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Panel } from '@/components/page-ui';
import { useUIPreferences } from '@/components/ui-preferences-provider';
export function AppearanceSettings() {
  const { preferences, update, sessionOnly } = useUIPreferences();
  return (
    <Panel
      title="Appearance"
      description="Make this workspace feel right for you."
      className="appearance-panel"
    >
      <div className="appearance-preview" aria-hidden="true">
        <div className="appearance-preview-rail">
          <span />
          <span />
          <span />
        </div>
        <div className="appearance-preview-canvas">
          <i />
          <div>
            <span />
            <span />
          </div>
          <b />
        </div>
        <span className="appearance-preview-label">
          <Sparkles size={14} /> Liquid Studio · Light
        </span>
      </div>
      <div className="appearance-options">
        <fieldset>
          <legend>
            <Move size={18} /> Motion
          </legend>
          <p>Responsive reactions, at your pace.</p>
          <div className="appearance-choice-group">
            {(['full', 'reduced'] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={preferences.motion === value}
                onClick={() => update({ motion: value })}
              >
                <span>
                  {value === 'full' ? 'Full motion' : 'Reduced motion'}
                </span>
                {preferences.motion === value && <Check size={16} />}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>
            <Layers size={18} /> Materials
          </legend>
          <p>Glass surrounds. Clear working surfaces.</p>
          <div className="appearance-choice-group">
            {(['glass', 'solid'] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={preferences.materials === value}
                onClick={() => update({ materials: value })}
              >
                <span>
                  {value === 'glass' ? 'Frosted glass' : 'Solid surfaces'}
                </span>
                {preferences.materials === value && <Check size={16} />}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>
            <PanelLeft size={18} /> Navigation
          </legend>
          <p>Labels when you need them. More room when you don’t.</p>
          <div className="appearance-choice-group">
            {(['responsive', 'expanded', 'collapsed'] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={
                  (preferences.navigation || 'responsive') === value
                }
                onClick={() =>
                  update({
                    navigation: value === 'responsive' ? undefined : value,
                  })
                }
              >
                <span>
                  {value === 'responsive'
                    ? 'Responsive'
                    : value === 'expanded'
                      ? 'Expanded'
                      : 'Compact'}
                </span>
                {(preferences.navigation || 'responsive') === value && (
                  <Check size={16} />
                )}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="section-footer">
        <output>
          {sessionOnly
            ? 'Appearance changes are session-only; browser storage is unavailable.'
            : 'Saved automatically on this browser.'}
        </output>
        <Link href="/design-system" className="text-link">
          Component studio
        </Link>
      </div>
    </Panel>
  );
}
