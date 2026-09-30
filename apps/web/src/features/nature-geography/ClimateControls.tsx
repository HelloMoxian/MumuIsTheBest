import { useState } from "react";
import type { Collection } from "./model";
import { CLIMATE_VIEWS, availableClimateGroups, climateGroupState, toggleClimateGroup, type ClimateView } from "./climate";

export function ClimateControls({ data, selected, onChange }: { data: Collection; selected: string[]; onChange: (ids: string[]) => void }) {
  const [view, setView] = useState<ClimateView>("常见类型");
  return <section className="geo-climate-controls" aria-label="气候类型筛选">
    <div className="geo-form-actions" role="group" aria-label="气候观察视角">
      {CLIMATE_VIEWS.map(item => <button key={item} aria-pressed={view === item} onClick={() => setView(item)}>{item}</button>)}
    </div>
    <div className="geo-form-actions"><button onClick={() => onChange(data.features.map(f => String(f.properties.id)))}>全选</button><button onClick={() => onChange([])}>清空</button><span>{selected.length ? "已选 " + selected.length + " 类" : "全部气候"}</span></div>
    {availableClimateGroups(data, view).map(group => {
      const state = climateGroupState(selected, group.codes);
      return <fieldset key={group.name}>
        <legend><label><input type="checkbox" checked={state.checked} ref={input => { if (input) input.indeterminate = state.mixed; }} aria-checked={state.mixed ? "mixed" : state.checked} onChange={() => onChange(toggleClimateGroup(selected, group.codes))} />{group.name}</label></legend>
        <div className="geo-climate-children">{group.codes.map(code => <label key={code}>
          <input type="checkbox" checked={selected.includes(code)} onChange={() => onChange(toggleClimateGroup(selected, [code]))} />
          <span>{data.features.find(f => f.properties.id === code)?.properties.name}</span><small>{code}</small>
        </label>)}</div>
      </fieldset>;
    })}
  </section>;
}
