import React, { useEffect, useState, useMemo } from "react";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2.js";
import Circle from "lucide-react/dist/esm/icons/circle.js";
import Clock from "lucide-react/dist/esm/icons/clock.js";
import Calendar from "lucide-react/dist/esm/icons/calendar.js";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle.js";
import Flame from "lucide-react/dist/esm/icons/flame.js";
import CheckSquare from "lucide-react/dist/esm/icons/check-square.js";
import MessageSquare from "lucide-react/dist/esm/icons/message-square.js";
import Paperclip from "lucide-react/dist/esm/icons/paperclip.js";
import UserPlus from "lucide-react/dist/esm/icons/user-plus.js";
import Star from "lucide-react/dist/esm/icons/star.js";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js";
import Edit2 from "lucide-react/dist/esm/icons/edit-2.js";
import Search from "lucide-react/dist/esm/icons/search.js";
import Filter from "lucide-react/dist/esm/icons/filter.js";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid.js";
import ListFilter from "lucide-react/dist/esm/icons/list-filter.js";
import PieChart from "lucide-react/dist/esm/icons/pie-chart.js";
import CalendarDays from "lucide-react/dist/esm/icons/calendar-days.js";
import MoreHorizontal from "lucide-react/dist/esm/icons/more-horizontal.js";
import X from "lucide-react/dist/esm/icons/x.js";
import Tag from "lucide-react/dist/esm/icons/tag.js";
import Send from "lucide-react/dist/esm/icons/send.js";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js";
import { apiFetch } from "../api.js";

const PRIORITY_META = {
	urgent: { label: "Urgent", color: "#d13438", icon: Flame },
	important: { label: "Important", color: "#ff8c00", icon: AlertTriangle },
	medium: { label: "Medium", color: "#0078d4", icon: Clock },
	low: { label: "Low", color: "#605e5c", icon: Circle },
};

const STATUS_META = {
	not_started: { label: "Not started", color: "#8a8886" },
	in_progress: { label: "In progress", color: "#0078d4" },
	completed: { label: "Completed", color: "#107c41" },
};

export default function PlannerPage() {
	const [plans, setPlans] = useState([]);
	const [activePlanId, setActivePlanId] = useState(null);
	const [fullPlan, setFullPlan] = useState({ plan: null, buckets: [], tasks: [], labels: [] });
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(true);

	// Views: 'board' | 'grid' | 'charts' | 'schedule'
	const [viewMode, setViewMode] = useState("board");
	const [groupBy, setGroupBy] = useState("bucket"); // 'bucket' | 'status' | 'priority' | 'assignee'
	const [searchQuery, setSearchQuery] = useState("");
	const [filterPriority, setFilterPriority] = useState("all");
	const [filterStatus, setFilterStatus] = useState("all");

	// Modals
	const [selectedTaskId, setSelectedTaskId] = useState(null);
	const [showNewPlanModal, setShowNewPlanModal] = useState(false);
	const [newPlanTitle, setNewPlanTitle] = useState("");
	const [newBucketName, setNewBucketName] = useState("");
	const [addingBucket, setAddingBucket] = useState(false);
	const [quickTaskTitle, setQuickTaskTitle] = useState({});

	// Drag state
	const [draggedTaskId, setDraggedTaskId] = useState(null);

	// Load initial plans and user accounts
	useEffect(() => {
		loadPlans();
		loadUsers();
	}, []);

	// Load full plan when activePlanId changes
	useEffect(() => {
		if (activePlanId) {
			loadFullPlan(activePlanId);
		}
	}, [activePlanId]);

	async function loadPlans() {
		try {
			setLoading(true);
			const data = await apiFetch("/planner/plans");
			setPlans(data || []);
			if (data && data.length > 0) {
				setActivePlanId(data[0].id);
			}
		} catch (err) {
			console.error("Failed to load plans:", err);
		} finally {
			setLoading(false);
		}
	}

	async function loadUsers() {
		try {
			const data = await apiFetch("/planner/users");
			setUsers(data || []);
		} catch (err) {
			console.error("Failed to load users:", err);
		}
	}

	async function loadFullPlan(planId) {
		try {
			const data = await apiFetch(`/planner/plans/${planId}/full`);
			setFullPlan(data);
		} catch (err) {
			console.error("Failed to load full plan:", err);
		}
	}

	// Create Plan
	async function handleCreatePlan(e) {
		e.preventDefault();
		if (!newPlanTitle.trim()) return;
		try {
			const created = await apiFetch("/planner/plans", {
				method: "POST",
				body: JSON.stringify({ title: newPlanTitle }),
			});
			setPlans((prev) => [created, ...prev]);
			setActivePlanId(created.id);
			setNewPlanTitle("");
			setShowNewPlanModal(false);
		} catch (err) {
			alert("Error creating plan: " + err.message);
		}
	}

	// Create Bucket
	async function handleCreateBucket(e) {
		e.preventDefault();
		if (!newBucketName.trim() || !activePlanId) return;
		try {
			const bucket = await apiFetch("/planner/buckets", {
				method: "POST",
				body: JSON.stringify({ plan_id: activePlanId, name: newBucketName }),
			});
			setFullPlan((prev) => ({
				...prev,
				buckets: [...prev.buckets, bucket],
			}));
			setNewBucketName("");
			setAddingBucket(false);
		} catch (err) {
			alert("Error creating bucket: " + err.message);
		}
	}

	// Delete Bucket
	async function handleDeleteBucket(bucketId) {
		if (!confirm("Are you sure you want to delete this bucket and its tasks?")) return;
		try {
			await apiFetch(`/planner/buckets/${bucketId}`, { method: "DELETE" });
			setFullPlan((prev) => ({
				...prev,
				buckets: prev.buckets.filter((b) => b.id !== bucketId),
				tasks: prev.tasks.filter((t) => t.bucket_id !== bucketId),
			}));
		} catch (err) {
			alert("Error deleting bucket: " + err.message);
		}
	}

	// Create Task Quick
	async function handleCreateTaskQuick(bucketId) {
		const title = quickTaskTitle[bucketId];
		if (!title || !title.trim() || !activePlanId) return;
		try {
			const newTask = await apiFetch("/planner/tasks", {
				method: "POST",
				body: JSON.stringify({
					plan_id: activePlanId,
					bucket_id: bucketId,
					title: title.trim(),
				}),
			});
			setFullPlan((prev) => ({
				...prev,
				tasks: [...prev.tasks, newTask],
			}));
			setQuickTaskTitle((prev) => ({ ...prev, [bucketId]: "" }));
		} catch (err) {
			alert("Error creating task: " + err.message);
		}
	}

	// Quick Toggle Task Status
	async function handleToggleComplete(task, e) {
		e.stopPropagation();
		const newStatus = task.progress_status === "completed" ? "not_started" : "completed";
		try {
			const updated = await apiFetch(`/planner/tasks/${task.id}`, {
				method: "PUT",
				body: JSON.stringify({ progress_status: newStatus }),
			});
			setFullPlan((prev) => ({
				...prev,
				tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, ...updated } : t)),
			}));
		} catch (err) {
			console.error("Failed to update status:", err);
		}
	}

	// Drag and Drop Handling
	function handleDragStart(e, taskId) {
		setDraggedTaskId(taskId);
		e.dataTransfer.setData("text/plain", taskId);
	}

	async function handleDropOnBucket(e, targetBucketId) {
		e.preventDefault();
		if (!draggedTaskId) return;

		const task = fullPlan.tasks.find((t) => t.id === draggedTaskId);
		if (!task || task.bucket_id === targetBucketId) {
			setDraggedTaskId(null);
			return;
		}

		// Optimistic update
		const updatedTasks = fullPlan.tasks.map((t) =>
			t.id === draggedTaskId ? { ...t, bucket_id: targetBucketId } : t
		);
		setFullPlan((prev) => ({ ...prev, tasks: updatedTasks }));
		setDraggedTaskId(null);

		try {
			await apiFetch(`/planner/tasks/${draggedTaskId}`, {
				method: "PUT",
				body: JSON.stringify({ bucket_id: targetBucketId }),
			});
		} catch (err) {
			console.error("Failed to update bucket via drag:", err);
			loadFullPlan(activePlanId); // Revert on failure
		}
	}

	function handleDragOver(e) {
		e.preventDefault();
	}

	// Filtered tasks
	const filteredTasks = useMemo(() => {
		return fullPlan.tasks.filter((t) => {
			if (searchQuery) {
				const q = searchQuery.toLowerCase();
				const matchTitle = t.title?.toLowerCase().includes(q);
				const matchDesc = t.description?.toLowerCase().includes(q);
				if (!matchTitle && !matchDesc) return false;
			}
			if (filterPriority !== "all" && t.priority !== filterPriority) return false;
			if (filterStatus !== "all" && t.progress_status !== filterStatus) return false;
			return true;
		});
	}, [fullPlan.tasks, searchQuery, filterPriority, filterStatus]);

	// Render Header toolbar
	const currentPlan = plans.find((p) => p.id === activePlanId);

	if (loading && !plans.length) {
		return <div className="planner-loading">Loading Planner...</div>;
	}

	return (
		<div className="planner-container">
			{/* Top Header Bar */}
			<header className="planner-header">
				<div className="planner-header-left">
					<div className="plan-selector">
						<select
							value={activePlanId || ""}
							onChange={(e) => setActivePlanId(Number(e.target.value))}
							className="plan-select-dropdown"
						>
							{plans.map((p) => (
								<option key={p.id} value={p.id}>
									{p.is_favorite ? "⭐ " : ""}{p.title}
								</option>
							))}
						</select>
						<button
							className="btn-icon"
							onClick={() => setShowNewPlanModal(true)}
							title="Create New Plan"
						>
							<Plus size={18} />
						</button>
					</div>

					{/* Navigation View Tabs */}
					<nav className="planner-view-tabs">
						<button
							className={`tab-btn ${viewMode === "board" ? "active" : ""}`}
							onClick={() => setViewMode("board")}
						>
							<LayoutGrid size={16} /> Board
						</button>
						<button
							className={`tab-btn ${viewMode === "grid" ? "active" : ""}`}
							onClick={() => setViewMode("grid")}
						>
							<ListFilter size={16} /> Grid
						</button>
						<button
							className={`tab-btn ${viewMode === "charts" ? "active" : ""}`}
							onClick={() => setViewMode("charts")}
						>
							<PieChart size={16} /> Charts
						</button>
						<button
							className={`tab-btn ${viewMode === "schedule" ? "active" : ""}`}
							onClick={() => setViewMode("schedule")}
						>
							<CalendarDays size={16} /> Schedule
						</button>
					</nav>
				</div>

				<div className="planner-header-right">
					{/* Search */}
					<div className="planner-search-box">
						<Search size={16} className="search-icon" />
						<input
							type="text"
							placeholder="Filter by keyword..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
						{searchQuery && (
							<X size={14} className="clear-icon" onClick={() => setSearchQuery("")} />
						)}
					</div>

					{/* Priority Filter */}
					<select
						value={filterPriority}
						onChange={(e) => setFilterPriority(e.target.value)}
						className="planner-filter-select"
					>
						<option value="all">All Priorities</option>
						<option value="urgent">🔥 Urgent</option>
						<option value="important">⚠️ Important</option>
						<option value="medium">⏱️ Medium</option>
						<option value="low">⚪ Low</option>
					</select>

					{/* Status Filter */}
					<select
						value={filterStatus}
						onChange={(e) => setFilterStatus(e.target.value)}
						className="planner-filter-select"
					>
						<option value="all">All Statuses</option>
						<option value="not_started">Not started</option>
						<option value="in_progress">In progress</option>
						<option value="completed">Completed</option>
					</select>
				</div>
			</header>

			{/* Main Content Area */}
			<div className="planner-content">
				{viewMode === "board" && (
					<BoardView
						buckets={fullPlan.buckets}
						tasks={filteredTasks}
						labels={fullPlan.labels}
						quickTaskTitle={quickTaskTitle}
						setQuickTaskTitle={setQuickTaskTitle}
						handleCreateTaskQuick={handleCreateTaskQuick}
						handleToggleComplete={handleToggleComplete}
						onTaskClick={(id) => setSelectedTaskId(id)}
						onDropBucket={handleDropOnBucket}
						onDragStart={handleDragStart}
						onDragOver={handleDragOver}
						addingBucket={addingBucket}
						setAddingBucket={setAddingBucket}
						newBucketName={newBucketName}
						setNewBucketName={setNewBucketName}
						handleCreateBucket={handleCreateBucket}
						handleDeleteBucket={handleDeleteBucket}
					/>
				)}

				{viewMode === "grid" && (
					<GridView
						buckets={fullPlan.buckets}
						tasks={filteredTasks}
						users={users}
						onTaskClick={(id) => setSelectedTaskId(id)}
						handleToggleComplete={handleToggleComplete}
					/>
				)}

				{viewMode === "charts" && (
					<ChartsView buckets={fullPlan.buckets} tasks={fullPlan.tasks} users={users} />
				)}

				{viewMode === "schedule" && (
					<ScheduleView tasks={filteredTasks} onTaskClick={(id) => setSelectedTaskId(id)} />
				)}
			</div>

			{/* Create New Plan Modal */}
			{showNewPlanModal && (
				<div className="planner-modal-backdrop" onClick={() => setShowNewPlanModal(false)}>
					<div className="planner-modal" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h3>Create New Plan</h3>
							<button className="btn-close" onClick={() => setShowNewPlanModal(false)}>
								<X size={18} />
							</button>
						</div>
						<form onSubmit={handleCreatePlan} className="modal-body">
							<div className="form-group">
								<label>Plan Name</label>
								<input
									type="text"
									placeholder="e.g. HVAC Maintenance Project"
									value={newPlanTitle}
									onChange={(e) => setNewPlanTitle(e.target.value)}
									required
									autoFocus
								/>
							</div>
							<div className="modal-actions">
								<button type="button" className="btn-secondary" onClick={() => setShowNewPlanModal(false)}>
									Cancel
								</button>
								<button type="submit" className="btn-primary">
									Create Plan
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Task Detail Side Modal Drawer */}
			{selectedTaskId && (
				<TaskDetailModal
					task={fullPlan.tasks.find((t) => t.id === selectedTaskId)}
					taskId={selectedTaskId}
					buckets={fullPlan.buckets}
					labels={fullPlan.labels}
					users={users}
					onClose={() => setSelectedTaskId(null)}
					onTaskUpdated={(updated) => {
						setFullPlan((prev) => ({
							...prev,
							tasks: prev.tasks.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
						}));
					}}
					onTaskDeleted={(deletedId) => {
						setFullPlan((prev) => ({
							...prev,
							tasks: prev.tasks.filter((t) => t.id !== deletedId),
						}));
						setSelectedTaskId(null);
					}}
				/>
			)}
		</div>
	);
}

// ── KANBAN BOARD VIEW ──────────────────────────────────────────────────────────
function BoardView({
	buckets,
	tasks,
	labels,
	quickTaskTitle,
	setQuickTaskTitle,
	handleCreateTaskQuick,
	handleToggleComplete,
	onTaskClick,
	onDropBucket,
	onDragStart,
	onDragOver,
	addingBucket,
	setAddingBucket,
	newBucketName,
	setNewBucketName,
	handleCreateBucket,
	handleDeleteBucket,
}) {
	return (
		<div className="planner-board">
			{buckets.map((bucket) => {
				const bucketTasks = tasks.filter((t) => t.bucket_id === bucket.id);

				return (
					<div
						key={bucket.id}
						className="planner-column"
						onDragOver={onDragOver}
						onDrop={(e) => onDropBucket(e, bucket.id)}
					>
						<div className="column-header">
							<div className="column-title-group">
								<h4>{bucket.name}</h4>
								<span className="task-badge">{bucketTasks.length}</span>
							</div>
							<button
								className="btn-icon-danger"
								onClick={() => handleDeleteBucket(bucket.id)}
								title="Delete Bucket"
							>
								<Trash2 size={15} />
							</button>
						</div>

						{/* Quick Add Task Input */}
						<div className="quick-add-task">
							<input
								type="text"
								placeholder="+ Add task"
								value={quickTaskTitle[bucket.id] || ""}
								onChange={(e) =>
									setQuickTaskTitle((prev) => ({ ...prev, [bucket.id]: e.target.value }))
								}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreateTaskQuick(bucket.id);
								}}
							/>
							{quickTaskTitle[bucket.id] && (
								<button className="btn-add-quick" onClick={() => handleCreateTaskQuick(bucket.id)}>
									Add
								</button>
							)}
						</div>

						{/* Task List */}
						<div className="column-task-list">
							{bucketTasks.map((task) => (
								<TaskCard
									key={task.id}
									task={task}
									labels={labels}
									onToggleComplete={handleToggleComplete}
									onClick={() => onTaskClick(task.id)}
									onDragStart={(e) => onDragStart(e, task.id)}
								/>
							))}
						</div>
					</div>
				);
			})}

			{/* Add New Bucket Column */}
			<div className="planner-column add-column">
				{addingBucket ? (
					<form onSubmit={handleCreateBucket} className="add-bucket-form">
						<input
							type="text"
							placeholder="Bucket name..."
							value={newBucketName}
							onChange={(e) => setNewBucketName(e.target.value)}
							autoFocus
							required
						/>
						<div className="add-bucket-actions">
							<button type="submit" className="btn-primary btn-sm">
								Add bucket
							</button>
							<button
								type="button"
								className="btn-secondary btn-sm"
								onClick={() => setAddingBucket(false)}
							>
								Cancel
							</button>
						</div>
					</form>
				) : (
					<button className="btn-add-bucket" onClick={() => setAddingBucket(true)}>
						<Plus size={18} /> Add bucket
					</button>
				)}
			</div>
		</div>
	);
}

// ── KANBAN TASK CARD ───────────────────────────────────────────────────────────
function TaskCard({ task, labels, onToggleComplete, onClick, onDragStart }) {
	const priorityInfo = PRIORITY_META[task.priority] || PRIORITY_META.medium;
	const PriorityIcon = priorityInfo.icon;
	const statusInfo = STATUS_META[task.progress_status] || STATUS_META.not_started;
	const isCompleted = task.progress_status === "completed";

	// Calculate checklist progress ratio
	const checklist = task.checklist || [];
	const completedChecklistCount = checklist.filter((c) => c.is_completed).length;
	const checklistPercent = checklist.length > 0 ? (completedChecklistCount / checklist.length) * 100 : 0;

	// Check if due date is overdue
	const isOverdue =
		task.due_date && !isCompleted && new Date(task.due_date) < new Date(new Date().setHours(0,0,0,0));

	const taskLabels = labels.filter((l) => (task.label_ids || []).includes(l.id));

	return (
		<div
			className={`planner-card ${isCompleted ? "completed" : ""} ${isOverdue ? "card-overdue" : ""}`}
			draggable
			onDragStart={onDragStart}
			onClick={onClick}
		>
			{/* Top Bar with Labels & Status Badge */}
			<div className="card-header-bar">
				{taskLabels.length > 0 ? (
					<div className="card-label-pills">
						{taskLabels.map((lbl) => (
							<span
								key={lbl.id}
								className="label-pill"
								style={{ backgroundColor: lbl.color_code }}
								title={lbl.name}
							>
								{lbl.name}
							</span>
						))}
					</div>
				) : (
					<span />
				)}

				<span
					className={`card-status-pill status-${task.progress_status}`}
					style={{ "--status-color": statusInfo.color }}
				>
					{statusInfo.label}
				</span>
			</div>

			<div className="card-top">
				<button
					className={`check-btn ${isCompleted ? "checked" : ""}`}
					onClick={(e) => onToggleComplete(task, e)}
					title={isCompleted ? "Mark incomplete" : "Mark complete"}
				>
					{isCompleted ? <CheckCircle2 size={19} className="check-svg" /> : <Circle size={19} className="check-svg" />}
				</button>
				<h5 className={`card-title ${isCompleted ? "completed-title" : ""}`}>{task.title}</h5>
			</div>

			{/* Checklist Preview Snippet */}
			{checklist.length > 0 && (
				<div className="card-checklist-section">
					<div className="checklist-progress-bar">
						<div
							className="checklist-progress-fill"
							style={{ width: `${checklistPercent}%` }}
						/>
					</div>
					<div className="checklist-preview-list">
						{checklist.slice(0, 3).map((item) => (
							<div key={item.id} className={`checklist-mini-item ${item.is_completed ? "done" : ""}`}>
								<span className="mini-bullet">{item.is_completed ? "✓" : "○"}</span>
								<span className="mini-title">{item.title}</span>
							</div>
						))}
						{checklist.length > 3 && (
							<span className="more-checklist-items">+{checklist.length - 3} more items</span>
						)}
					</div>
				</div>
			)}

			{/* Task Footer Meta Info */}
			<div className="card-meta">
				<div className="meta-left">
					{/* Priority Icon Pill */}
					<span
						className={`priority-pill priority-${task.priority}`}
						style={{ color: priorityInfo.color }}
						title={`Priority: ${priorityInfo.label}`}
					>
						<PriorityIcon size={13} /> {priorityInfo.label}
					</span>

					{/* Due Date */}
					{task.due_date && (
						<span className={`due-date-badge ${isOverdue ? "overdue" : ""}`}>
							<Calendar size={12} /> {new Date(task.due_date).toLocaleDateString()}
						</span>
					)}

					{/* Comments Count */}
					{task.comment_count > 0 && (
						<span className="comment-badge">
							<MessageSquare size={12} /> {task.comment_count}
						</span>
					)}
				</div>

				{/* Assignees Avatars */}
				<div className="card-assignees">
					{(task.assignees || []).map((u) => (
						<div key={u.id} className="avatar-circle" title={`${u.name} ${u.last_name || ""}`}>
							{u.name ? u.name[0].toUpperCase() : "U"}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

// ── GRID / TABLE VIEW ──────────────────────────────────────────────────────────
function GridView({ buckets, tasks, users, onTaskClick, handleToggleComplete }) {
	return (
		<div className="planner-grid-container">
			<table className="planner-table">
				<thead>
					<tr>
						<th style={{ width: "40px" }}></th>
						<th>Task Title</th>
						<th>Bucket</th>
						<th>Progress</th>
						<th>Priority</th>
						<th>Due Date</th>
						<th>Assignees</th>
					</tr>
				</thead>
				<tbody>
					{tasks.map((task) => {
						const bucket = buckets.find((b) => b.id === task.bucket_id);
						const priority = PRIORITY_META[task.priority] || PRIORITY_META.medium;
						const isCompleted = task.progress_status === "completed";

						return (
							<tr key={task.id} onClick={() => onTaskClick(task.id)} className="grid-row">
								<td onClick={(e) => e.stopPropagation()}>
									<button
										className={`check-btn ${isCompleted ? "checked" : ""}`}
										onClick={(e) => handleToggleComplete(task, e)}
									>
										{isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
									</button>
								</td>
								<td className="task-title-cell">
									<strong className={isCompleted ? "completed-title" : ""}>{task.title}</strong>
								</td>
								<td>
									<span className="bucket-tag">{bucket ? bucket.name : "Unassigned"}</span>
								</td>
								<td>
									<span
										className="status-tag"
										style={{ color: STATUS_META[task.progress_status]?.color }}
									>
										{STATUS_META[task.progress_status]?.label}
									</span>
								</td>
								<td>
									<span className="priority-tag" style={{ color: priority.color }}>
										{priority.label}
									</span>
								</td>
								<td>{task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"}</td>
								<td>
									<div className="card-assignees">
										{(task.assignees || []).map((u) => (
											<div key={u.id} className="avatar-circle" title={`${u.name}`}>
												{u.name ? u.name[0].toUpperCase() : "U"}
											</div>
										))}
									</div>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

// ── CHARTS VIEW (ANALYTICS HUB) ────────────────────────────────────────────────
function ChartsView({ buckets, tasks, users }) {
	const totalTasks = tasks.length;
	const completedCount = tasks.filter((t) => t.progress_status === "completed").length;
	const inProgressCount = tasks.filter((t) => t.progress_status === "in_progress").length;
	const notStartedCount = tasks.filter((t) => t.progress_status === "not_started").length;

	const urgentCount = tasks.filter((t) => t.priority === "urgent").length;
	const importantCount = tasks.filter((t) => t.priority === "important").length;
	const mediumCount = tasks.filter((t) => t.priority === "medium").length;
	const lowCount = tasks.filter((t) => t.priority === "low").length;

	return (
		<div className="planner-charts-container">
			<div className="charts-grid">
				{/* Status Breakdown Card */}
				<div className="chart-card">
					<h3>Status Breakdown</h3>
					<div className="status-summary-list">
						<div className="status-item">
							<span className="dot" style={{ backgroundColor: "#107c41" }} />
							<span>Completed:</span>
							<strong>{completedCount}</strong>
						</div>
						<div className="status-item">
							<span className="dot" style={{ backgroundColor: "#0078d4" }} />
							<span>In Progress:</span>
							<strong>{inProgressCount}</strong>
						</div>
						<div className="status-item">
							<span className="dot" style={{ backgroundColor: "#8a8886" }} />
							<span>Not Started:</span>
							<strong>{notStartedCount}</strong>
						</div>
					</div>
					{totalTasks > 0 && (
						<div className="progress-bar-overall">
							<div
								className="bar-fill completed"
								style={{ width: `${(completedCount / totalTasks) * 100}%` }}
							/>
							<div
								className="bar-fill in-progress"
								style={{ width: `${(inProgressCount / totalTasks) * 100}%` }}
							/>
						</div>
					)}
				</div>

				{/* Priority Breakdown Card */}
				<div className="chart-card">
					<h3>Priority Breakdown</h3>
					<div className="priority-summary-list">
						<div className="priority-bar-item">
							<span className="p-label" style={{ color: "#d13438" }}>🔥 Urgent</span>
							<div className="p-bar-track">
								<div
									className="p-bar-fill"
									style={{
										width: totalTasks > 0 ? `${(urgentCount / totalTasks) * 100}%` : "0%",
										backgroundColor: "#d13438",
									}}
								/>
							</div>
							<strong>{urgentCount}</strong>
						</div>
						<div className="priority-bar-item">
							<span className="p-label" style={{ color: "#ff8c00" }}>⚠️ Important</span>
							<div className="p-bar-track">
								<div
									className="p-bar-fill"
									style={{
										width: totalTasks > 0 ? `${(importantCount / totalTasks) * 100}%` : "0%",
										backgroundColor: "#ff8c00",
									}}
								/>
							</div>
							<strong>{importantCount}</strong>
						</div>
						<div className="priority-bar-item">
							<span className="p-label" style={{ color: "#0078d4" }}>⏱️ Medium</span>
							<div className="p-bar-track">
								<div
									className="p-bar-fill"
									style={{
										width: totalTasks > 0 ? `${(mediumCount / totalTasks) * 100}%` : "0%",
										backgroundColor: "#0078d4",
									}}
								/>
							</div>
							<strong>{mediumCount}</strong>
						</div>
					</div>
				</div>

				{/* Bucket Distribution Card */}
				<div className="chart-card">
					<h3>Tasks per Bucket</h3>
					<div className="bucket-chart-list">
						{buckets.map((b) => {
							const count = tasks.filter((t) => t.bucket_id === b.id).length;
							return (
								<div key={b.id} className="bucket-bar-row">
									<span className="b-name">{b.name}</span>
									<div className="p-bar-track">
										<div
											className="p-bar-fill"
											style={{
												width: totalTasks > 0 ? `${(count / totalTasks) * 100}%` : "0%",
												backgroundColor: "#0078d4",
											}}
										/>
									</div>
									<strong>{count}</strong>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}

// ── SCHEDULE VIEW (CALENDAR) ────────────────────────────────────────────────────
function ScheduleView({ tasks, onTaskClick }) {
	const tasksWithDates = tasks.filter((t) => t.due_date);

	return (
		<div className="planner-schedule-container">
			<h3>Task Schedule</h3>
			<div className="schedule-task-list">
				{tasksWithDates.length === 0 ? (
					<p className="empty-text">No tasks with due dates assigned.</p>
				) : (
					tasksWithDates.map((t) => (
						<div key={t.id} className="schedule-item" onClick={() => onTaskClick(t.id)}>
							<div className="date-badge">{new Date(t.due_date).toLocaleDateString()}</div>
							<div className="schedule-title">
								<strong>{t.title}</strong>
								<span className="status-pill" style={{ color: STATUS_META[t.progress_status]?.color }}>
									{STATUS_META[t.progress_status]?.label}
								</span>
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
}

// ── TASK DETAIL MODAL DRAWER ───────────────────────────────────────────────────
function TaskDetailModal({ task: taskProp, taskId, buckets, labels, users, onClose, onTaskUpdated, onTaskDeleted }) {
	const [task, setTask] = useState(taskProp);
	const [comments, setComments] = useState([]);
	const [newCommentText, setNewCommentText] = useState("");

	// Checklist input
	const [newChecklistText, setNewChecklistText] = useState("");

	useEffect(() => {
		setTask(taskProp);
		loadComments();
	}, [taskId, taskProp]);

	async function loadTaskDetails() {
		try {
			setLoading(true);
			// Find task from API or current plan state
			const data = await apiFetch(`/planner/plans`);
			// We can fetch full plan again or fetch task directly
			setLoading(false);
		} catch (err) {
			console.error(err);
		}
	}

	async function loadComments() {
		try {
			const data = await apiFetch(`/planner/tasks/${taskId}/comments`);
			setComments(data || []);
		} catch (err) {
			console.error("Failed to load comments:", err);
		}
	}

	async function handleUpdateField(fields) {
		try {
			const updated = await apiFetch(`/planner/tasks/${taskId}`, {
				method: "PUT",
				body: JSON.stringify(fields),
			});
			onTaskUpdated(updated);
		} catch (err) {
			alert("Error updating task: " + err.message);
		}
	}

	async function handleAddChecklistItem(e) {
		e.preventDefault();
		if (!newChecklistText.trim()) return;
		try {
			const item = await apiFetch(`/planner/tasks/${taskId}/checklist`, {
				method: "POST",
				body: JSON.stringify({ title: newChecklistText.trim() }),
			});
			onTaskUpdated({
				...task,
				checklist: [...(task?.checklist || []), item],
			});
			setNewChecklistText("");
		} catch (err) {
			alert("Error adding checklist item: " + err.message);
		}
	}

	async function handleToggleChecklist(checkId, currentVal) {
		try {
			const updatedItem = await apiFetch(`/planner/checklist/${checkId}`, {
				method: "PUT",
				body: JSON.stringify({ is_completed: !currentVal }),
			});
			onTaskUpdated({
				...task,
				checklist: (task?.checklist || []).map((c) => (c.id === checkId ? updatedItem : c)),
			});
		} catch (err) {
			console.error("Checklist update failed:", err);
		}
	}

	async function handleAddComment(e) {
		e.preventDefault();
		if (!newCommentText.trim()) return;
		try {
			const added = await apiFetch(`/planner/tasks/${taskId}/comments`, {
				method: "POST",
				body: JSON.stringify({ comment: newCommentText.trim() }),
			});
			setComments((prev) => [...prev, added]);
			setNewCommentText("");
		} catch (err) {
			alert("Error adding comment: " + err.message);
		}
	}

	async function handleDeleteTask() {
		if (!confirm("Are you sure you want to delete this task?")) return;
		try {
			await apiFetch(`/planner/tasks/${taskId}`, { method: "DELETE" });
			onTaskDeleted(taskId);
		} catch (err) {
			alert("Error deleting task: " + err.message);
		}
	}

	return (
		<div className="planner-drawer-backdrop" onClick={onClose}>
			<div className="planner-drawer" onClick={(e) => e.stopPropagation()}>
				<div className="drawer-header">
					<div className="drawer-header-left">
						<button className="btn-close" onClick={onClose}>
							<X size={20} />
						</button>
						<span>Task Details</span>
					</div>
					<button className="btn-icon-danger" onClick={handleDeleteTask} title="Delete Task">
						<Trash2 size={18} />
					</button>
				</div>

				<div className="drawer-body">
					{/* Task Title Input */}
					<div className="drawer-section">
						<input
							type="text"
							className="drawer-title-input"
							placeholder="Task title..."
							defaultValue={task?.title || ""}
							onBlur={(e) => handleUpdateField({ title: e.target.value })}
						/>
					</div>

					{/* Meta Selectors Grid */}
					<div className="drawer-meta-grid">
						{/* Bucket */}
						<div className="meta-field">
							<label>Bucket</label>
							<select
								value={task?.bucket_id || ""}
								onChange={(e) => handleUpdateField({ bucket_id: Number(e.target.value) })}
							>
								{buckets.map((b) => (
									<option key={b.id} value={b.id}>
										{b.name}
									</option>
								))}
							</select>
						</div>

						{/* Progress */}
						<div className="meta-field">
							<label>Progress</label>
							<select
								value={task?.progress_status || "not_started"}
								onChange={(e) => handleUpdateField({ progress_status: e.target.value })}
							>
								<option value="not_started">Not started</option>
								<option value="in_progress">In progress</option>
								<option value="completed">Completed</option>
							</select>
						</div>

						{/* Priority */}
						<div className="meta-field">
							<label>Priority</label>
							<select
								value={task?.priority || "medium"}
								onChange={(e) => handleUpdateField({ priority: e.target.value })}
							>
								<option value="urgent">🔥 Urgent</option>
								<option value="important">⚠️ Important</option>
								<option value="medium">⏱️ Medium</option>
								<option value="low">⚪ Low</option>
							</select>
						</div>

						{/* Due Date */}
						<div className="meta-field">
							<label>Due Date</label>
							<input
								type="date"
								value={task?.due_date ? task.due_date.split("T")[0] : ""}
								onChange={(e) => handleUpdateField({ due_date: e.target.value || null })}
							/>
						</div>
					</div>

					{/* Description */}
					<div className="drawer-section">
						<label className="section-label">Description</label>
						<textarea
							placeholder="Add description..."
							rows={3}
							defaultValue={task?.description || ""}
							onBlur={(e) => handleUpdateField({ description: e.target.value })}
						/>
					</div>

					{/* Comments & Activity Stream */}
					<div className="drawer-section">
						<label className="section-label">Comments & Activity</label>
						<div className="comments-list">
							{comments.map((c) => (
								<div key={c.id} className="comment-item">
									<div className="avatar-circle">
										{c.user_name ? c.user_name[0].toUpperCase() : "U"}
									</div>
									<div className="comment-bubble">
										<div className="comment-meta">
											<strong>{c.user_name} {c.user_last_name}</strong>
											<small>{new Date(c.created_at).toLocaleString()}</small>
										</div>
										<p>{c.comment}</p>
									</div>
								</div>
							))}
						</div>

						<form onSubmit={handleAddComment} className="add-comment-box">
							<input
								type="text"
								placeholder="Write a comment..."
								value={newCommentText}
								onChange={(e) => setNewCommentText(e.target.value)}
							/>
							<button type="submit" className="btn-primary btn-sm">
								<Send size={14} /> Send
							</button>
						</form>
					</div>
				</div>
			</div>
		</div>
	);
}
