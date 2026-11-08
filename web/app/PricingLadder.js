// The three plans as three rockets standing on the launch pad, each taller than the last (Stargazer < Explorer < Singularity): the rocket IS the card,
// and everything about the plan is written on its hull. Nose and fins are SVG outlines (stroke only, in the plan's colour), the body is a flat panel with
// hairline sides, the flame under each engine flickers. The billing toggle and checkout still find their hooks: .price-amt, .round-bill, [data-plan].
function Hull({ numeral, children }) {
  return (
    <>
      <svg className="rung-fin rung-fin-l" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M100 0 0 56V100H100" />
      </svg>
      <svg className="rung-fin rung-fin-r" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0 100 56V100H0" />
      </svg>
      <div className="rung-hull">
        <svg className="rung-nose" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M1 100C1 60 22 18 50 1 78 18 99 60 99 100" />
        </svg>
        <div className="rung-port mono" aria-hidden="true">{numeral}</div>
        <div className="rung-body">{children}</div>
      </div>
      <div className="rung-nozzle" aria-hidden="true" />
      <svg className="rung-flame" viewBox="0 0 40 80" aria-hidden="true">
        <path d="M20 2C32 22 36 40 20 78 4 40 8 22 20 2Z" />
        <path className="rung-flame-core" d="M20 24C27 38 28 48 20 66 12 48 13 38 20 24Z" />
      </svg>
    </>
  );
}

export default function PricingLadder({ singularityRemaining }) {
  return (
    <div className="ladder">
      <article className="rung rung-1 reveal">
        <Hull numeral="I">
          <div className="round-label">Free</div>
          <h3>Stargazer</h3>
          <div className="round-desc">Look at your leagues before you pay.</div>
          <div className="rung-price">
            <div className="round-price">$0</div>
            <div className="round-bill">&nbsp;</div>
          </div>
          <div className="rung-cta">
            <a href="/login" className="round-btn outline" data-plan="stargazer">
              Become a Stargazer
            </a>
            <p className="round-assure">Free, no card</p>
          </div>
          <ul className="round-features rung-feats">
            <li>Check any Sleeper account, save 1 league</li>
            <li>Weekly rankings, top 50</li>
            <li>Season simulations, top 10</li>
            <li>
              Dynasty and prospect previews <em className="round-soon">Soon</em>
            </li>
            <li>Newsletter and Discord</li>
          </ul>
        </Hull>
      </article>

      <article className="rung rung-2 reveal d1">
        <Hull numeral="II">
          <div className="round-label">Run every league</div>
          <h3>Explorer</h3>
          <span className="round-badge round-badge-gold">MOST POPULAR</span>
          <div className="round-desc">All your leagues, saved and watched.</div>
          <div className="rung-price">
            <div className="round-price">
              <sup>$</sup>
              <span className="price-amt" data-monthly="9" data-annual="7">
                7
              </span>
              <sub>/mo</sub>
            </div>
            <div className="round-bill" data-monthly="billed monthly" data-annual="$84 billed yearly">
              $84 billed yearly
            </div>
          </div>
          <div className="rung-cta">
            <a href="#" className="round-btn primary" data-plan="explorer">
              Become an Explorer
            </a>
            <p className="round-assure">14-day refund · cancel anytime</p>
          </div>
          <ul className="round-features rung-feats">
            <li>Everything in Stargazer</li>
            <li>Up to 10 leagues, auto-refreshed</li>
            <li>Exposure map and buy-ins at risk</li>
            <li>
              Weekly email and lineup alert <em className="round-soon">Soon</em>
            </li>
            <li>Every player in the weekly rankings</li>
            <li>Compare up to 4 players</li>
            <li>
              Dynasty rankings and rookie board <em className="round-soon">Soon</em>
            </li>
            <li>
              Full prospect rankings <em className="round-soon">Soon</em>
            </li>
            <li>Special Discord role</li>
          </ul>
        </Hull>
      </article>

      <article className="rung rung-3 reveal d2">
        <Hull numeral="III">
          <div className="round-label">Full Access</div>
          <h3>Singularity</h3>
          <span className="round-badge round-badge-blue">
            {singularityRemaining > 0 ? `${singularityRemaining} FOUNDING SPOTS LEFT` : "FOUNDING SPOTS FULL"}
          </span>
          <div className="round-desc">Every player&apos;s full range, for the leagues where the edge decides it.</div>
          <div className="rung-price">
            <div className="round-price">
              <sup>$</sup>
              <span className="price-amt" data-monthly="25" data-annual="20">
                20
              </span>
              <sub>/mo</sub>
            </div>
            <div className="round-bill" data-monthly="billed monthly" data-annual="$240 billed yearly">
              $240 billed yearly
            </div>
          </div>
          <div className="rung-cta">
            <a href="#" className="round-btn outline" data-plan="singularity">
              Reach Singularity
            </a>
            <p className="round-assure">14-day refund · cancel anytime</p>
          </div>
          <ul className="round-features rung-feats">
            <li>Everything in Explorer</li>
            <li>Unlimited leagues</li>
            <li>Full season simulations, every player</li>
            <li>Pace, percentile and role tags</li>
            <li>
              Personal Team Analysis <em className="round-soon">Soon</em>
            </li>
            <li>CSV export of every list</li>
            <li>Priority Discord, early beta access</li>
          </ul>
        </Hull>
      </article>
    </div>
  );
}
