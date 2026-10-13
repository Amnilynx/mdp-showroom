const STEPS = [
  { num: 1, label: "Choose Type" },
  { num: 2, label: "Browse List" },
  { num: 3, label: "Customize" },
  { num: 4, label: "Request Quote" },
];

// currentStep: 1-4
export default function StepProgress({ currentStep }) {
  return (
    <div className="step-progress">
      {STEPS.map((step, i) => (
        <div key={step.num} className="step-progress-item">
          <div className="step-progress-row">
            <span
              className={
                "step-dot" +
                (step.num === currentStep
                  ? " step-dot-active"
                  : step.num < currentStep
                  ? " step-dot-done"
                  : "")
              }
            >
              {step.num < currentStep ? "✓" : ""}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={
                  "step-line" + (step.num < currentStep ? " step-line-done" : "")
                }
              />
            )}
          </div>
          <span
            className={
              "step-label" + (step.num === currentStep ? " step-label-active" : "")
            }
          >
            {step.num}. {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}