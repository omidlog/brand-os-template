import Link from '@docusaurus/Link'
import Layout from '@theme/Layout'
import status from '../data/status.json'
import { asNext } from '../data/records'

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export default function Home(): React.ReactElement {
  const groups = [
    ['brand', 'Brand Identity'],
    ['business', 'Business OS'],
    ['system', 'Optional systems'],
  ] as const
  return (
    <Layout title="Dashboard" description="Brand OS template dashboard. Example values are not approved.">
      <header className="hero container">
        <p className="badge">{status.nameStatus}</p>
        <h1>{status.brandName}</h1>
        <p>
          This is the template dashboard. Coverage means a required field has an honest disposition. Approval means a person accepted it. They are not the same number.
        </p>
        <div className="grid">
          <Meter label="Coverage" value={status.coverage} detail={`${status.requiredUnanswered} required fields still unanswered`} />
          <Meter label="Approval" value={status.approval} detail="Approved required fields only" />
          <article className="card">
            <h2>Open contradictions</h2>
            <p>{status.contradictions}</p>
            <p>Audience of this build: {status.audience}. Restricted answers are not shown here.</p>
          </article>
        </div>
      </header>
      <main className="container" style={{ paddingBottom: '3rem' }}>
        <h2>Next interview questions</h2>
        <ul>
          {asNext(status).map((question) => (
            <li key={question.id}>
              <code>{question.id}</code> · {question.priority} — {question.prompt}
            </li>
          ))}
        </ul>
        {groups.map(([group, label]) => {
          const modules = status.modules.filter((module) => module.group === group)
          if (modules.length === 0) return null
          return (
            <section key={group}>
              <h2>{label}</h2>
              <div className="grid">
                {modules.map((module) => (
                  <article key={module.id} className="card">
                    <p className="badge">{module.code}</p>
                    <h3>
                      <Link to={module.href}>{module.title}</Link>
                    </h3>
                    <p>Coverage {percent(module.coverage)} · Approval {percent(module.approval)}</p>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </main>
    </Layout>
  )
}

function Meter({ label, value, detail }: { label: string; value: number; detail: string }): React.ReactElement {
  const width = `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`
  return (
    <article className="card">
      <h2>{label}</h2>
      <p>{percent(value)}</p>
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
        <span style={{ width }} />
      </div>
      <p>{detail}</p>
    </article>
  )
}
