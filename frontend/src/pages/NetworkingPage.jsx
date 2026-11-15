import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { networkingService } from '../services/networking.service.js';
import toast from 'react-hot-toast';
import {
  Users,
  MessageSquare,
  Share2,
  Heart,
  Send,
  UserCheck,
  UserPlus,
  Loader2,
  CheckCircle,
  XCircle,
  Briefcase,
  GraduationCap,
} from 'lucide-react';

export default function NetworkingPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('feed'); // 'feed' | 'connections' | 'messages'

  // Feed state
  const [feed, setFeed] = useState([]);
  const [postContent, setPostContent] = useState('');
  const [postType, setPostType] = useState('UPDATE');
  const [feedLoading, setFeedLoading] = useState(false);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [activeCommentsPostId, setActiveCommentsPostId] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  // Connections state
  const [connectionsData, setConnectionsData] = useState({ connections: [], incomingRequests: [], outgoingRequests: [] });
  const [connLoading, setConnLoading] = useState(false);

  // Messages state
  const [conversations, setConversations] = useState([]);
  const [activePeer, setActivePeer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newDirectMessage, setNewDirectMessage] = useState('');
  const [msgLoading, setMsgLoading] = useState(false);

  // Load feed
  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const data = await networkingService.getFeed();
      setFeed(data.items || []);
    } catch (err) {
      toast.error('Failed to load feed');
    } finally {
      setFeedLoading(false);
    }
  }, []);

  // Load connections
  const loadConnections = useCallback(async () => {
    setConnLoading(true);
    try {
      const data = await networkingService.getConnections();
      setConnectionsData(data);
    } catch (err) {
      toast.error('Failed to load connections');
    } finally {
      setConnLoading(false);
    }
  }, []);

  // Load conversations
  const loadConversations = useCallback(async () => {
    setMsgLoading(true);
    try {
      const data = await networkingService.getConversations();
      setConversations(data.items || []);
    } catch (err) {
      toast.error('Failed to load conversations');
    } finally {
      setMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'feed') loadFeed();
    else if (tab === 'connections') loadConnections();
    else if (tab === 'messages') loadConversations();
  }, [tab, loadFeed, loadConnections, loadConversations]);

  // Feed Actions
  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!postContent.trim()) return;
    setSubmittingPost(true);
    try {
      const newPost = await networkingService.createPost({ content: postContent, postType });
      setFeed([newPost, ...feed]);
      setPostContent('');
      toast.success('Post published to LanTURN network!');
    } catch (err) {
      toast.error(err.message || 'Failed to create post');
    } finally {
      setSubmittingPost(false);
    }
  };

  const handleLikePost = async (postId) => {
    try {
      const res = await networkingService.likePost(postId);
      setFeed(
        feed.map((p) =>
          p.id === postId ? { ...p, isLiked: res.isLiked, likesCount: res.likesCount } : p
        )
      );
    } catch {
      toast.error('Could not update like');
    }
  };

  const handleToggleComments = async (postId) => {
    if (activeCommentsPostId === postId) {
      setActiveCommentsPostId(null);
      setComments([]);
      return;
    }
    setActiveCommentsPostId(postId);
    try {
      const res = await networkingService.getComments(postId);
      setComments(res.items || []);
    } catch {
      toast.error('Could not load comments');
    }
  };

  const handleAddComment = async (postId) => {
    if (!newComment.trim()) return;
    try {
      const created = await networkingService.addComment(postId, newComment);
      setComments([...comments, created]);
      setNewComment('');
      setFeed(feed.map((p) => (p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p)));
    } catch {
      toast.error('Failed to post comment');
    }
  };

  // Connection Actions
  const handleAccept = async (id) => {
    try {
      await networkingService.acceptRequest(id);
      toast.success('Connection accepted!');
      loadConnections();
    } catch {
      toast.error('Failed to accept request');
    }
  };

  const handleReject = async (id) => {
    try {
      await networkingService.rejectRequest(id);
      toast('Connection request ignored');
      loadConnections();
    } catch {
      toast.error('Failed to reject request');
    }
  };

  // Messaging Actions
  const openChat = async (peer) => {
    setActivePeer(peer);
    setMsgLoading(true);
    try {
      const res = await networkingService.getMessages(peer.id);
      setMessages(res.messages || []);
    } catch {
      toast.error('Could not load messages');
    } finally {
      setMsgLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newDirectMessage.trim() || !activePeer) return;
    try {
      const sent = await networkingService.sendMessage(activePeer.id, newDirectMessage);
      setMessages([...messages, sent]);
      setNewDirectMessage('');
      loadConversations();
    } catch {
      toast.error('Could not send message');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Top Banner */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-400" />
            LanTURN Professional Network
          </h1>
          <p className="text-gray-400 mt-1">
            Connect with students, alumni, and recruiters. Share career milestones and collaborate.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 self-start">
          <button
            onClick={() => setTab('feed')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
              tab === 'feed' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Activity Feed
          </button>
          <button
            onClick={() => setTab('connections')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-all flex items-center gap-2 ${
              tab === 'connections' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Connections
            {connectionsData.incomingRequests.length > 0 && (
              <span className="bg-amber-500 text-black text-xs font-bold px-1.5 py-0.5 rounded-full">
                {connectionsData.incomingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('messages')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
              tab === 'messages' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Messages
          </button>
        </div>
      </div>

      {/* ── TAB 1: FEED ── */}
      {tab === 'feed' && (
        <div className="space-y-6">
          {/* Post composer */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg">
            <form onSubmit={handleCreatePost} className="space-y-4">
              <textarea
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder={`What are you working on, ${user?.name || 'there'}? Share a project, milestone or career question...`}
                rows={3}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Post Type:</span>
                  <select
                    value={postType}
                    onChange={(e) => setPostType(e.target.value)}
                    className="bg-gray-950 border border-gray-800 rounded-md px-2 py-1 text-xs text-gray-300 focus:outline-none"
                  >
                    <option value="UPDATE">Update</option>
                    <option value="ACHIEVEMENT">Achievement</option>
                    <option value="PROJECT">Project</option>
                    <option value="QUESTION">Question</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={submittingPost || !postContent.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
                >
                  {submittingPost ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Publish Post
                </button>
              </div>
            </form>
          </div>

          {/* Feed List */}
          {feedLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
          ) : feed.length === 0 ? (
            <div className="text-center py-16 bg-gray-900/50 border border-gray-800/80 rounded-xl">
              <Share2 className="h-12 w-12 text-gray-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-300">No posts in the network yet</h3>
              <p className="text-gray-500 text-sm mt-1">Be the first to share an update or project!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {feed.map((post) => (
                <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm">
                  {/* Author Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-blue-900/50 border border-blue-700/50 flex items-center justify-center font-bold text-blue-400">
                        {post.author?.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <h4 className="font-semibold text-white leading-tight">{post.author?.name}</h4>
                        <p className="text-xs text-gray-400">{post.author?.headline || post.author?.role}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                      {post.postType}
                    </span>
                  </div>

                  {/* Content */}
                  <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed mb-4">{post.content}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-6 pt-3 border-t border-gray-800/80 text-xs text-gray-400">
                    <button
                      onClick={() => handleLikePost(post.id)}
                      className={`flex items-center gap-1.5 transition-colors ${
                        post.isLiked ? 'text-rose-500 font-semibold' : 'hover:text-rose-400'
                      }`}
                    >
                      <Heart className={`h-4 w-4 ${post.isLiked ? 'fill-current' : ''}`} />
                      <span>{post.likesCount} Likes</span>
                    </button>

                    <button
                      onClick={() => handleToggleComments(post.id)}
                      className="flex items-center gap-1.5 hover:text-blue-400 transition-colors"
                    >
                      <MessageSquare className="h-4 w-4" />
                      <span>{post.commentsCount} Comments</span>
                    </button>
                  </div>

                  {/* Comments accordion */}
                  {activeCommentsPostId === post.id && (
                    <div className="mt-4 pt-4 border-t border-gray-800 space-y-3">
                      <div className="space-y-2">
                        {comments.map((c) => (
                          <div key={c.id} className="bg-gray-950/80 rounded-lg p-3 text-xs">
                            <span className="font-semibold text-blue-400 mr-2">{c.author?.name}:</span>
                            <span className="text-gray-300">{c.content}</span>
                          </div>
                        ))}
                      </div>

                      {/* Add comment input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="Write a comment..."
                          className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => handleAddComment(post.id)}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: CONNECTIONS ── */}
      {tab === 'connections' && (
        <div className="space-y-8">
          {/* Pending Incoming Requests */}
          {connectionsData.incomingRequests.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
                Pending Connection Requests ({connectionsData.incomingRequests.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {connectionsData.incomingRequests.map((req) => (
                  <div key={req.id} className="bg-gray-900 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white">{req.requester?.name}</h4>
                      <p className="text-xs text-gray-400">{req.requester?.headline || req.requester?.role}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccept(req.id)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg"
                        title="Accept"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        className="bg-gray-800 hover:bg-rose-900 text-gray-400 hover:text-white p-2 rounded-lg"
                        title="Decline"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Connections */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              My Network ({connectionsData.connections.length})
            </h3>
            {connLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              </div>
            ) : connectionsData.connections.length === 0 ? (
              <div className="text-center py-16 bg-gray-900/50 border border-gray-800/80 rounded-xl">
                <UserPlus className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-300">Your network is empty</h3>
                <p className="text-gray-500 text-sm mt-1">Connect with classmates and recruiters across the platform.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {connectionsData.connections.map((conn) => (
                  <div key={conn.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-blue-900/40 border border-blue-700/50 flex items-center justify-center font-bold text-blue-300">
                        {conn.peer?.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <h4 className="font-bold text-white">{conn.peer?.name}</h4>
                        <p className="text-xs text-gray-400">{conn.peer?.headline || conn.peer?.role}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setTab('messages');
                        openChat(conn.peer);
                      }}
                      className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Message
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: DIRECT MESSAGING ── */}
      {tab === 'messages' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-900 border border-gray-800 rounded-xl min-h-[550px] overflow-hidden">
          {/* Conversation List */}
          <div className="border-r border-gray-800 p-4 space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Chats</h3>
            {conversations.length === 0 ? (
              <p className="text-xs text-gray-500">No active conversations. Start chatting with your connections!</p>
            ) : (
              conversations.map((convo) => (
                <button
                  key={convo.peer?.id}
                  onClick={() => openChat(convo.peer)}
                  className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${
                    activePeer?.id === convo.peer?.id ? 'bg-blue-600/20 border border-blue-500/40' : 'hover:bg-gray-800/60'
                  }`}
                >
                  <div className="h-9 w-9 rounded-full bg-gray-800 flex items-center justify-center font-bold text-xs text-gray-300 flex-shrink-0">
                    {convo.peer?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{convo.peer?.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{convo.lastMessage?.content || 'No messages'}</p>
                  </div>
                  {convo.unreadCount > 0 && (
                    <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {convo.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Chat Window */}
          <div className="md:col-span-2 flex flex-col justify-between p-4">
            {activePeer ? (
              <>
                {/* Chat Header */}
                <div className="flex items-center gap-3 pb-3 border-b border-gray-800">
                  <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs text-white">
                    {activePeer.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">{activePeer.name}</h4>
                    <p className="text-[11px] text-gray-400">{activePeer.headline || activePeer.role}</p>
                  </div>
                </div>

                {/* Message Log */}
                <div className="flex-1 overflow-y-auto py-4 space-y-3 max-h-[400px]">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-lg px-3.5 py-2 text-xs leading-relaxed ${
                          m.isMine ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200'
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Chat Input */}
                <form onSubmit={handleSendMessage} className="flex gap-2 pt-3 border-t border-gray-800">
                  <input
                    type="text"
                    value={newDirectMessage}
                    onChange={(e) => setNewDirectMessage(e.target.value)}
                    placeholder={`Message ${activePeer.name}...`}
                    className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-16 text-gray-500">
                <MessageSquare className="h-12 w-12 stroke-1 mb-2" />
                <p className="text-sm">Select a connection to start messaging</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
