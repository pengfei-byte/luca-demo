export default function IncomingCall({ persona, onAnswer, onDecline }) {
  return (
    <div className="incoming" role="dialog" aria-label={`${persona.shortName} is calling`}>
      <img className="incoming-bg" src={persona.photo} alt="" />
      <div className="incoming-shade" />
      <div className="incoming-copy">
        <img className="incoming-avatar" src={persona.photo} alt="" />
        <h2>{persona.shortName}</h2>
        <p>is calling you…</p>
      </div>
      <div className="incoming-actions">
        <button type="button" className="decline" onClick={onDecline}>
          Decline
        </button>
        <button type="button" className="answer" onClick={onAnswer}>
          Answer
        </button>
      </div>
    </div>
  );
}
