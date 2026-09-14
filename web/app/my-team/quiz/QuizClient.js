"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { submitGmArchetypeQuiz } from "../actions";

export default function QuizClient({ questions, initialResult }) {
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(initialResult);
  const [error, setError] = useState(null);
  const [isPending, startTransition] = useTransition();

  const answeredCount = Object.keys(answers).length;
  const isComplete = answeredCount === questions.length;

  function choose(questionKey, value) {
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitGmArchetypeQuiz(answers);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setResult(res.value);
    });
  }

  if (result) {
    return (
      <div className="quiz-result reveal in">
        <div className="quiz-result-label">Your GM Archetype</div>
        <h2 className="quiz-result-title">{result.label}</h2>
        <p className="quiz-result-blurb">{result.blurb}</p>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setResult(null);
            setAnswers({});
          }}
        >
          Retake the Quiz
        </button>
        <Link href="/my-team" className="quiz-result-back">
          ← Back to My Team
        </Link>
      </div>
    );
  }

  return (
    <div className="quiz-form">
      {questions.map((q) => (
        <fieldset key={q.key} className="quiz-question">
          <legend className="quiz-prompt">{q.prompt}</legend>
          <div className="quiz-options">
            {q.options.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className={`quiz-option${answers[q.key] === opt.value ? " quiz-option-selected" : ""}`}
                onClick={() => choose(q.key, opt.value)}
                aria-pressed={answers[q.key] === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      {error && <p className="quiz-error">{error}</p>}

      <button
        type="button"
        className="btn-primary quiz-submit"
        disabled={!isComplete || isPending}
        onClick={submit}
      >
        {isPending ? "Scoring…" : isComplete ? "See My Archetype" : `${answeredCount} of ${questions.length} answered`}
      </button>
    </div>
  );
}
