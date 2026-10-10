export default function Profile({ data, onBack, onContinue, onForget, onPreference, onDefine }) {
  if (!data) return <div className="screen-center" />;
  const { profile, bond, secrets, chapters, memories } = data;
  return (
    <div className="profile">
      <header className="profile-top">
        <button type="button" onClick={onBack}>
          ‹ Back
        </button>
        <strong>{data.shortName}</strong>
      </header>
      <section className="profile-hero">
        <img src={data.photo} alt="" />
        <h1>
          {profile.name} · {profile.age} · {profile.city}
        </h1>
        <p>{profile.disclosure}</p>
        <p className="profile-connection">
          Your connection: {bond.stageName}
          <span>
            Closeness {bond.closeness} / 100
          </span>
        </p>
        <p className="profile-next">{bond.next?.line}{bond.next?.detail ? ` · ${bond.next.detail}` : ""}</p>
      </section>

      <section>
        <h2>About Luca</h2>
        <p>{profile.role}</p>
        <p>{profile.impression}</p>
        <p>{profile.interests.join(" · ")}</p>
        <ul>
          {profile.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
        <p>{profile.meeting}</p>
      </section>

      <section>
        <h2>Things he has shared</h2>
        <ul className="secret-list">
          {secrets.map((secret) => (
            <li key={secret.id} className={secret.status}>
              <strong>{secret.status === "revealed" ? secret.title : secret.title}</strong>
              <span>{secret.status === "revealed" ? secret.body : secret.teaser}</span>
              {secret.status !== "revealed" && <em>Opens through “{secret.opens}”</em>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Your story</h2>
        <ul className="chapter-list">
          {chapters.map((chapter) => (
            <li key={chapter.id}>
              <span>{chapter.title}</span>
              {chapter.status === "available" ? (
                <button type="button" onClick={() => onContinue(chapter.id)}>
                  Continue
                </button>
              ) : (
                <em>{chapter.status === "completed" ? "Completed" : "Locked"}</em>
              )}
            </li>
          ))}
        </ul>
        {bond.next?.type === "definition" && (
          <div className="define">
            <p>How should he think of this?</p>
            <button type="button" onClick={() => onDefine("romantic")}>
              Something romantic
            </button>
            <button type="button" onClick={() => onDefine("companion")}>
              Close, without romance
            </button>
          </div>
        )}
      </section>

      <section>
        <h2>What you'll allow</h2>
        <label>
          <input
            type="checkbox"
            checked={bond.preferences.flirt !== "off"}
            onChange={(e) => onPreference({ flirt: e.target.checked ? "light" : "off" })}
          />
          Light flirting
        </label>
        <label>
          <input
            type="checkbox"
            checked={bond.preferences.nickname === true}
            onChange={(e) => onPreference({ nickname: e.target.checked })}
          />
          A nickname
        </label>
        <label>
          <input
            type="checkbox"
            checked={bond.preferences.touch === true}
            onChange={(e) => onPreference({ touch: e.target.checked })}
          />
          Imagined closeness
        </label>
      </section>

      {memories.length > 0 && (
        <section>
          <h2>Shared memories</h2>
          <ul className="memory-list">
            {memories.map((memory) => (
              <li key={memory.id}>
                <span>{memory.text}</span>
                <button type="button" onClick={() => onForget(memory.id)}>
                  Forget
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
