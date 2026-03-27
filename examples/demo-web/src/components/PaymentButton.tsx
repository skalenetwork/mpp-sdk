import './PaymentButton.css'

interface PaymentButtonProps {
  type: string
  title: string
  description: string
  icon: string
  onClick: () => void
  disabled: boolean
}

function PaymentButton({ title, description, icon, onClick, disabled }: PaymentButtonProps) {
  return (
    <button 
      className="payment-button"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="payment-icon">{icon}</span>
      <div className="payment-info">
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
    </button>
  )
}

export default PaymentButton
