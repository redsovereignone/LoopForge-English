const levels = {
  none: { label: "Close", icon: "sparkles", detail: "Use no additional reasoning." },
  thinking: { label: "Enable", icon: "brain", detail: "Enable reasoning." },
  minimal: { label: "Minimal", icon: "effort-low", detail: "Use minimal reasoning for the fastest response." },
  low: { label: "Low", icon: "effort-low", detail: "Prioritize speed for simple questions." },
  medium: { label: "Medium", icon: "effort-medium", detail: "Balance response time and reasoning depth." },
  high: { label: "High", icon: "brain", detail: "Use deeper reasoning for complex questions." },
  xhigh: { label: "Higher", icon: "search", detail: "Spend more time reasoning through difficult tasks." },
  max: { label: "Maximum", icon: "effort-max", detail: "Use the highest reasoning effort this model supports. This can take longer." },
  ultra: { label: "Ultra", icon: "effort-max", detail: "Use ultra reasoning effort. This can take longer." },
  ultracode: { label: "Ultra", icon: "effort-max", detail: "Use the model’s ultracode reasoning effort. This can take longer." },
};

export function modelEffort(model, value) {
  return model?.efforts?.includes(value) ? value : "";
}

export function effortOptions(model) {
  return [
    { id: "", label: "Default", icon: "sparkles", detail: "Use the model’s default reasoning effort." },
    ...(model?.efforts || []).filter((id) => levels[id]).map((id) => ({ id, ...levels[id] })),
  ];
}
