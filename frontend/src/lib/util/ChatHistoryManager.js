/**
 * Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Amazon Software License (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *   http://aws.amazon.com/asl/
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

class ChatHistoryManager {
  static instance = null;

  constructor(chatRef, setChat) {
    if (ChatHistoryManager.instance) {
      return ChatHistoryManager.instance;
    }

    this.chatRef = chatRef;
    this.setChat = setChat;
    ChatHistoryManager.instance = this;
  }

  static getInstance(chatRef, setChat) {
    if (!ChatHistoryManager.instance) {
      ChatHistoryManager.instance = new ChatHistoryManager(chatRef, setChat);
    } else if (chatRef && setChat) {
      // Update references if they're provided
      ChatHistoryManager.instance.chatRef = chatRef;
      ChatHistoryManager.instance.setChat = setChat;
    }
    return ChatHistoryManager.instance;
  }

  addTextMessage(content) {
    if (!this.chatRef || !this.setChat) {
      console.error(
        "ChatHistoryManager: chatRef or setChat is not initialized"
      );
      return;
    }

    let history = this.chatRef.current?.history || [];
    let updatedChatHistory = [...history];
    let lastTurn = updatedChatHistory[updatedChatHistory.length - 1];

    if (lastTurn !== undefined && lastTurn.role === content.role) {
      // Same role, append to the last turn
      updatedChatHistory[updatedChatHistory.length - 1] = {
        ...content,
        message: lastTurn.message + " " + content.message,
      };
    } else {
      // Different role, add a new turn
      updatedChatHistory.push({
        role: content.role,
        message: content.message,
      });
    }

    this.setChat({
      history: updatedChatHistory,
    });
  }

  endTurn() {
    if (!this.chatRef || !this.setChat) {
      console.error(
        "ChatHistoryManager: chatRef or setChat is not initialized"
      );
      return;
    }

    let history = this.chatRef.current?.history || [];
    let updatedChatHistory = history.map((item) => {
      return {
        ...item,
        endOfResponse: true,
      };
    });

    this.setChat({
      history: updatedChatHistory,
    });
  }

  endConversation() {
    if (!this.chatRef || !this.setChat) {
      console.error(
        "ChatHistoryManager: chatRef or setChat is not initialized"
      );
      return;
    }

    let history = this.chatRef.current?.history || [];
    let updatedChatHistory = history.map((item) => {
      return {
        ...item,
        endOfResponse: true,
      };
    });

    updatedChatHistory.push({
      endOfConversation: true,
    });

    this.setChat({
      history: updatedChatHistory,
    });
  }
}

export default ChatHistoryManager;
