export default function Gate({ persona, onEnter }) {
  return (
    <div className="gate">
      <img className="gate-photo" src={persona.photo} alt={persona.name} />
      <div className="gate-shade" />
      <div className="gate-copy">
        <p className="gate-kicker">1 new message</p>
        <h1>One question, after the gala.</h1>
        <button type="button" className="gate-cta" onClick={onEnter}>
          Open his message
        </button>
        <p className="gate-legal">
          18+ only · {persona.shortName} is an AI character · By continuing you confirm you are 18 or older.
        </p>
      </div>
    </div>
  );
}
