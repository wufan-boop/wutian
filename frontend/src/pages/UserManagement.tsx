import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  App as AntApp,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useEffect, useState } from 'react'

interface UserItem {
  id: number
  username: string
  role: string
  display_name: string
  is_active: boolean
  created_at: string
}

const API = (path: string, opt: RequestInit = {}) =>
  fetch(path, {
    ...opt,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      ...(opt.headers || {}),
    },
  })

export default function UserManagement() {
  const { message, modal } = AntApp.useApp()
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserItem | null>(null)
  const [form] = Form.useForm()

  async function loadUsers() {
    setLoading(true)
    const res = await API('/api/users')
    if (res.ok) setUsers(await res.json())
    else message.error('加载失败')
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  function openCreate() {
    setEditUser(null)
    form.resetFields()
    setModalOpen(true)
  }

  function openEdit(user: UserItem) {
    setEditUser(user)
    form.setFieldsValue({ username: user.username, role: user.role, display_name: user.display_name })
    setModalOpen(true)
  }

  async function handleSubmit() {
    try {
      await form.validateFields()
    } catch { return }
    const values = form.getFieldsValue()
    let res
    if (editUser) {
      const body: Record<string, string> = { role: values.role }
      if (values.password) body.password = values.password
      if (values.display_name) body.display_name = values.display_name
      res = await API(`/api/users/${editUser.id}`, { method: 'PUT', body: JSON.stringify(body) })
    } else {
      res = await API('/api/users', { method: 'POST', body: JSON.stringify(values) })
    }
    if (res.ok) {
      message.success(editUser ? '修改成功' : '创建成功')
      setModalOpen(false)
      loadUsers()
    } else {
      const err = await res.json()
      message.error(err.detail || '操作失败')
    }
  }

  async function handleDelete(user: UserItem) {
    modal.confirm({
      title: `确认删除用户 "${user.username}"？`,
      content: '删除后无法恢复',
      okType: 'danger',
      onOk: async () => {
        const res = await API(`/api/users/${user.id}`, { method: 'DELETE' })
        if (res.ok) { message.success('已删除'); loadUsers() }
        else message.error('删除失败')
      },
    })
  }

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      render: (v: string, r: UserItem) => (
        <Space>
          <UserOutlined />
          <Typography.Text strong>{v}</Typography.Text>
          {r.display_name && r.display_name !== v && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>({r.display_name})</Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 100,
      render: (v: string) => (
        <Tag color={v === 'admin' ? 'gold' : 'blue'}>
          {v === 'admin' ? '管理员' : '用户'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      width: 80,
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'}>{v ? '正常' : '禁用'}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 160,
      render: (v: string) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v}</Typography.Text>,
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: UserItem) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>用户管理</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增用户</Button>
      </div>

      <Card style={{ borderRadius: 12 }}>
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={false}
        />
      </Card>

      <Modal
        title={editUser ? '编辑用户' : '新增用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="确认"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label="用户名" rules={[{ required: !editUser, message: '请输入用户名' }]}>
            <Input disabled={!!editUser} placeholder="英文，如 zhangsan" />
          </Form.Item>
          <Form.Item name="display_name" label="显示名称">
            <Input placeholder="如：张三（可选）" />
          </Form.Item>
          <Form.Item
            name="password"
            label={editUser ? '新密码（不填则不修改）' : '密码'}
            rules={[{ required: !editUser, message: '请输入密码' }]}
          >
            <Input.Password placeholder="至少6位" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="user" rules={[{ required: true }]}>
            <Select options={[
              { value: 'user', label: '用户（普通运营）' },
              { value: 'admin', label: '管理员' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
