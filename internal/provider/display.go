package provider

// DisplayMessage projects one model-context message onto a user-visible
// surface. The returned value is a copy, so provider context and persisted
// history keep the full text required for multi-step execution.
func DisplayMessage(message Message) (Message, bool) {
	if message.DisplayHidden {
		return Message{}, false
	}
	if message.DisplayToolsOnly {
		message.Content = ""
		message.Images = nil
		message.ReasoningContent = ""
		message.ReasoningSignature = ""
		message.MemoryCitations = nil
		message.Edited = false
		message.Original = ""
	}
	return message, true
}
