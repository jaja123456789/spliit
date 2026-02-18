import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { randomId, getCategories } from '@/lib/api'
import { Client } from 'pg'
import { default as csv } from 'csv-parser'
import { createReadStream } from 'fs'

async function writeData(groupName: string, currency: string, data: any) {

  // Get map of category name to ID
  const categoryMapping: Record<string, number> = {}
  const categories = await getCategories()

  for (const categoryRow of categories) {
    categoryMapping[categoryRow.name.toLowerCase()] = categoryRow.id
  }

  // Create the Group
  const groupId = randomId()
  const group: Prisma.GroupCreateInput = {
    id: groupId,
    name: groupName,
    currency: currency,
    createdAt: new Date(),
  }

  const participantIdsMapping: Record<string, string> = {}
  const participants: Prisma.ParticipantCreateManyInput[] = []

  // Find Participants and add
  const participantList = Object.keys(data[0]).slice(5)

  for (const participant of participantList) {
    const id = randomId()
    participantIdsMapping[participant] = id

    participants.push({
      id,
      groupId: groupId,
      name: participant,
    })
  }

  // Iterate expense data and add expenses
  const expenses: Prisma.ExpenseCreateManyInput[] = []
  const expenseParticipants: Prisma.ExpensePaidForCreateManyInput[] = []    

  for (const expenseRow of data) {
    const id = randomId()
    let paidBy:string = ""

    // replace the "other" category names. e.g. "Entertainment - other" -> "Entertainment"
    const expenseCategory = expenseRow.Category.toLowerCase().replace(" - other", "")

    // Find the remaining amount for the paying participant
    const totalAmt = participantList.reduce((sum, participant) => sum + (expenseRow[participant] < 0 ? Math.abs(expenseRow[participant]) : 0),0)
    const paidByShare = Math.round((expenseRow.Cost - totalAmt)*100)

    for (const participant of participantList) {
      const participantShare = expenseRow[participant]
      const absShare = Math.abs(participantShare*100)

      if (participantShare > 0) {
        paidBy = participant
      }

      if (expenseCategory == "payment") {
        // This is a repayment so expenseParticipants is any other
        // group participant that has a negative amount in the row.
        // This should generally just be one other participant.
        if (participantShare < 0) {
          expenseParticipants.push({
            expenseId: id,
            participantId: participantIdsMapping[participant],
            shares: absShare
          })
        }
      } else if (participantShare != 0) {
        // This group participant is part of this expense
        expenseParticipants.push({
          expenseId: id,
          participantId: participantIdsMapping[participant],
          shares: (paidBy == participant) ? paidByShare : absShare
        })
      }
    }

    if (paidBy !== "") {
      expenses.push({
        id,
        amount: Math.round(Number(expenseRow.Cost) * 100),
        groupId: groupId,
        title: expenseRow.Description,
        expenseDate: new Date(expenseRow.Date),
        categoryId: expenseCategory === "payment" ? 2 : categoryMapping[expenseCategory] ?? 1,
        createdAt: new Date(),
        isReimbursement: expenseCategory === "payment",
        splitMode: "BY_AMOUNT"
      })
    }
  }

  console.log('Creating group:', group)
  await prisma.group.create({ data: group })

  console.log('Creating participants:', participants)
  await prisma.participant.createMany({ data: participants })

  console.log('Creating expenses:', expenses)
  await prisma.expense.createMany({ data: expenses })

  console.log('Creating expenseParticipants:', expenseParticipants)
  await prisma.expensePaidFor.createMany({data: expenseParticipants })

  console.log(groupId)
}

async function main() {
    const groupName = "Test Group"
    const currency = "£"
    const fileName = "./test-group_export.csv"

    withClient(async (client) => {
        // Load CSV
        const data:any = []

        createReadStream(fileName)
          .pipe(csv())
          .on('data', (r: any) => {
              // console.log(r);
              data.push(r);        
          })
          .on('end', async () => {
              // console.log(data);
              await writeData(groupName, currency, data)
          })
    })
}

async function withClient(fn: (client: Client) => void | Promise<void>) {
  const client = new Client({
    connectionString: process.env.POSTGRES_PRISMA_URL,
    ssl: false,
  })
  await client.connect()
  console.log('Connected.')

  try {
    await fn(client)
  } finally {
    await client.end()
    console.log('Disconnected.')
  }
}
  
// Run using: npx ts-node ./src/scripts/import.ts
// Need to downgrade nanoid to 3.3.4 to avoid import errors
// npm uninstall nanoid               
// npm install nanoid@3.3.4
main().catch(console.error)
