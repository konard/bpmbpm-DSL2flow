# EPC2 Diagram: Leave Request Approval

## Workflow Viewpoint (Mermaid)

```mermaid
flowchart TD
    START{{ProcessStart}}
    F1[FillAndSubmit]
    E1{{RequestSubmitted}}
    F2[ApproveByManager]
    E2{{ManagerApproved\ndecision == approved}}
    E3{{ManagerRejected\ndecision == rejected}}
    F3[ApproveByDirector]
    E4{{DirectorApproved\ndecision == approved}}
    E5{{DirectorRejected\ndecision == rejected}}
    F4[NotifyApproval]
    F5[NotifyRejection]
    E6{{ApprovalNotified}}
    E7{{RejectionNotified}}
    END{{ProcessEnd}}

    START --> F1
    F1 --> E1
    E1 --> F2
    F2 --> E2
    F2 --> E3
    E2 --> F3
    E3 --> F5
    F3 --> E4
    F3 --> E5
    E4 --> F4
    E5 --> F5
    F4 --> E6
    F5 --> E7
    E6 --> END
    E7 --> END
```

## Full EPC2 (Workflow + Docflow + Roles)

```mermaid
flowchart LR
    %% Document states (west side / left of functions)
    DOC0[/LeaveRequest:\ntemplate/]
    DOC1[/LeaveRequest:\nsubmitted/]
    DOC2[/LeaveRequest:\nmanager_approved/]
    DOC3[/LeaveRequest:\ndirector_approved/]
    DOC4[/LeaveRequest:\nrejected/]

    %% Roles (east side / right of functions)
    R1([Applicant])
    R2([Manager])
    R3([Director])
    R4([System])

    %% Workflow
    START{{ProcessStart}}
    F1[FillAndSubmit]
    E1{{RequestSubmitted}}
    F2[ApproveByManager]
    E2{{ManagerApproved\napproved}}
    E3{{ManagerRejected\nrejected}}
    F3[ApproveByDirector]
    E4{{DirectorApproved\napproved}}
    E5{{DirectorRejected\nrejected}}
    F4[NotifyApproval]
    F5[NotifyRejection]
    E6{{ApprovalNotified}}
    E7{{RejectionNotified}}
    END{{ProcessEnd}}

    %% Control flow
    START --> F1
    F1 --> E1
    E1 --> F2
    F2 --> E2
    F2 --> E3
    E2 --> F3
    E3 --> F5
    F3 --> E4
    F3 --> E5
    E4 --> F4
    E5 --> F5
    F4 --> E6
    F5 --> E7
    E6 --> END
    E7 --> END

    %% Docflow (west side of functions)
    DOC0 -- in --> F1
    F1 -- out --> DOC1
    DOC1 -- in --> F2
    F2 -- out --> DOC2
    F2 -- out --> DOC4
    DOC2 -- in --> F3
    F3 -- out --> DOC3
    F3 -- out --> DOC4
    DOC3 -- in --> F4
    DOC4 -- in --> F5

    %% Role associations (east side)
    F1 -.-> R1
    F2 -.-> R2
    F3 -.-> R3
    F4 -.-> R4
    F5 -.-> R4
```

## Notes on EPC2 Rules Applied

1. **No explicit AND/OR/XOR gateways** — the conditions live inside the event hexagons.
2. **XOR-split** at `ApproveByManager`: `ManagerApproved` and `ManagerRejected` are mutually exclusive (decision can only be 'approved' OR 'rejected').
3. **XOR-split** at `ApproveByDirector`: same pattern.
4. **Document flows** appear on the **west (left) side** of each function as parallelograms connected with labeled arrows.
5. **Roles** appear on the **east (right) side** of each function with dashed association lines.
6. Both `NotifyApproval` and `NotifyRejection` converge to the same `ProcessEnd` — implicit XOR-join (only one path fires per instance).
