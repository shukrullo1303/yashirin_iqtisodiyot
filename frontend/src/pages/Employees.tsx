import React from 'react'
import { useQuery } from 'react-query'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material'
import apiClient from '../api/client'

interface Employee {
  id: number
  full_name: string
  position?: string | null
  phone?: string | null
  is_registered: boolean
  is_active: boolean
  location_name?: string
}

function Employees() {
  const { data: employees = [], isLoading, isError } = useQuery<Employee[]>('employees', async () => {
    const response = await apiClient.get('employees/')
    return response.data
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError) {
    return <Alert severity="error">Xodimlarni yuklashda xatolik yuz berdi.</Alert>
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Xodimlar
      </Typography>
      <TableContainer component={Paper} sx={{ mt: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>F.I.Sh.</TableCell>
              <TableCell>Lokatsiya</TableCell>
              <TableCell>Lavozim</TableCell>
              <TableCell>Telefon</TableCell>
              <TableCell>Ro'yxatdan o'tgan</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>{employee.full_name}</TableCell>
                <TableCell>{employee.location_name || '-'}</TableCell>
                <TableCell>{employee.position || '-'}</TableCell>
                <TableCell>{employee.phone || '-'}</TableCell>
                <TableCell>
                  <Chip
                    label={employee.is_registered ? 'Ha' : 'Yo\'q'}
                    color={employee.is_registered ? 'success' : 'error'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={employee.is_active ? 'Faol' : 'Nofaol'}
                    color={employee.is_active ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default Employees
