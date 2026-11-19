package domain

import (
	"strings"
	"testing"
)

func TestApprovalWaitReason(t *testing.T) {
	run := Run{WorkflowSnapshot: WorkflowDefinition{
		Name: "通用后端交付 SOP",
		Nodes: []WorkflowNode{
			{ID: "impl", Name: "代码实现"}, {ID: "test", Name: "测试"},
			{ID: "gate", Name: "上线确认", Type: "approval", RejectTo: "impl", TaskPrompt: "检查测试报告和 MR 改动范围"},
			{ID: "release", Name: "发布"},
		},
		Edges: []WorkflowEdge{{Source: "impl", Target: "gate"}, {Source: "test", Target: "gate"}, {Source: "gate", Target: "release"}},
	}}
	got := ApprovalWaitReason(run, "gate")
	want := "SOP “通用后端交付 SOP” requires approval at this step. Review the results from “代码实现”, “测试”. Approval continues to “发布”. Rejection returns to “代码实现” for rework. Approval criteria: 检查测试报告和 MR 改动范围"
	if got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}

	run.WorkflowSnapshot.Edges = nil
	run.WorkflowSnapshot.Nodes[2].TaskPrompt = ""
	run.WorkflowSnapshot.Nodes[2].RejectTo = ""
	if got := ApprovalWaitReason(run, "gate"); !strings.Contains(got, "Review the results from “测试”") || !strings.Contains(got, "Approval continues to “发布”") || strings.Contains(got, "Approval criteria") {
		t.Fatalf("list-order fallback: %s", got)
	}
	if ApprovalWaitReason(run, "missing") != "" {
		t.Fatal("unknown node must yield empty reason")
	}
}

func TestApprovalWaitReasonFallbacks(t *testing.T) {
	run := Run{WorkflowSnapshot: WorkflowDefinition{
		Nodes: []WorkflowNode{{ID: "gate", Type: "approval"}},
	}}
	want := "This SOP requires approval at this step. Approval completes the run."
	if got := ApprovalWaitReason(run, "gate"); got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}

	run.WorkflowSnapshot = WorkflowDefinition{
		Name:  "  ",
		Nodes: []WorkflowNode{{ID: "gate", RejectTo: "ghost"}, {ID: "next", Name: "  "}},
	}
	want = "This SOP requires approval at this step. Approval continues to “next”. Rejection returns to “ghost” for rework."
	if got := ApprovalWaitReason(run, "gate"); got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

func TestApprovalNeighborsIgnoresEmptyEdgeEnds(t *testing.T) {
	wf := WorkflowDefinition{
		Nodes: []WorkflowNode{{ID: "a", Name: "甲"}, {ID: "gate"}, {ID: "b", Name: "乙"}},
		Edges: []WorkflowEdge{{Source: "", Target: "gate"}, {Source: "gate", Target: ""}, {Source: "a", Target: "gate"}},
	}
	up, down := approvalNeighbors(wf, 1)
	if strings.Join(up, ",") != "“甲”" || len(down) != 0 {
		t.Fatalf("up=%v down=%v", up, down)
	}
	if got := approvalSOPLabel(" 交付 "); got != "SOP “交付”" {
		t.Fatalf("sop label: %s", got)
	}
}
