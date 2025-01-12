using DCL.Interface;
using JetBrains.Annotations;

public class FriendsTabView : FriendsTabViewBase
{
    public EntryList onlineFriendsList = new EntryList();
    public EntryList offlineFriendsList = new EntryList();
    public event System.Action<FriendEntry> OnWhisper;
    public event System.Action<string> OnDeleteConfirmation;

    private string lastProcessedFriend;

    public override void Initialize(FriendsHUDView owner, int preinstantiatedEntries)
    {
        base.Initialize(owner, preinstantiatedEntries);

        onlineFriendsList.toggleTextPrefix = "ONLINE";
        offlineFriendsList.toggleTextPrefix = "OFFLINE";

        if (ChatController.i != null)
        {
            ChatController.i.OnAddMessage -= ChatController_OnAddMessage;
            ChatController.i.OnAddMessage += ChatController_OnAddMessage;
        }
    }

    public override void OnDestroy()
    {
        base.OnDestroy();

        if (ChatController.i != null)
            ChatController.i.OnAddMessage -= ChatController_OnAddMessage;
    }

    public override bool CreateEntry(string userId)
    {
        if (!base.CreateEntry(userId)) return false;

        var entry = GetEntry(userId) as FriendEntry;

        entry.OnWhisperClick += (x) => OnWhisper?.Invoke(x);
        entry.OnJumpInClick += (x) => this.owner.OnCloseButtonPressed();

        return true;
    }

    public override bool RemoveEntry(string userId)
    {
        if (!base.RemoveEntry(userId))
            return false;

        offlineFriendsList.Remove(userId);
        onlineFriendsList.Remove(userId);
        offlineFriendsList.RemoveLastTimestamp(userId);
        onlineFriendsList.RemoveLastTimestamp(userId);
        return true;
    }

    public override bool UpdateEntry(string userId, FriendEntryBase.Model model)
    {
        if (!base.UpdateEntry(userId, model))
            return false;

        var entry = entries[userId];

        if (model.status == PresenceStatus.ONLINE)
        {
            offlineFriendsList.Remove(userId);
            onlineFriendsList.Add(userId, entry);

            var removedTimestamp = offlineFriendsList.RemoveLastTimestamp(userId);
            onlineFriendsList.AddOrUpdateLastTimestamp(removedTimestamp);
        }
        else
        {
            onlineFriendsList.Remove(userId);
            offlineFriendsList.Add(userId, entry);

            var removedTimestamp = onlineFriendsList.RemoveLastTimestamp(userId);
            offlineFriendsList.AddOrUpdateLastTimestamp(removedTimestamp);
        }

        return true;
    }

    protected override void OnPressDeleteButton(string userId)
    {
        if (string.IsNullOrEmpty(userId)) return;

        FriendEntryBase friendEntryToDelete = GetEntry(userId);
        if (friendEntryToDelete != null)
        {
            confirmationDialog.SetText($"Are you sure you want to delete {friendEntryToDelete.model.userName} as a friend?");
            confirmationDialog.Show(() =>
            {
                RemoveEntry(userId);
                OnDeleteConfirmation?.Invoke(userId);
            });
        }
    }

    private void ChatController_OnAddMessage(ChatMessage message)
    {
        if (message.messageType != ChatMessage.Type.PRIVATE)
            return;

        FriendEntryBase friend = GetEntry(message.sender != UserProfile.GetOwnUserProfile().userId
            ? message.sender
            : message.recipient);

        if (friend == null)
            return;

        bool reorderFriendEntries = false;

        if (friend.userId != lastProcessedFriend)
        {
            lastProcessedFriend = friend.userId;
            reorderFriendEntries = true;
        }

        LastFriendTimestampModel timestampToUpdate = new LastFriendTimestampModel
        {
            userId = friend.userId,
            lastMessageTimestamp = message.timestamp
        };

        // Each time a private message is received (or sent by the player), we sort the online and offline lists by timestamp
        if (friend.model.status == PresenceStatus.ONLINE)
        {
            onlineFriendsList.AddOrUpdateLastTimestamp(timestampToUpdate, reorderFriendEntries);
        }
        else
        {
            offlineFriendsList.AddOrUpdateLastTimestamp(timestampToUpdate, reorderFriendEntries);
        }

        lastProcessedFriend = friend.userId;
    }
}